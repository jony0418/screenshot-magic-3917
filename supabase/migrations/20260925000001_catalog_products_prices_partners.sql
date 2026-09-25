-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  barcode text,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  brand text,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  max_stock numeric(14,3) NOT NULL DEFAULT 0,
  avg_cost numeric(14,4) NOT NULL DEFAULT 0,
  last_cost numeric(14,4) NOT NULL DEFAULT 0,
  tax_rate numeric(5,4) NOT NULL DEFAULT 0.1600,
  image_url text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX products_name_idx ON public.products (lower(name));
CREATE INDEX products_barcode_idx ON public.products (barcode);
CREATE INDEX products_category_idx ON public.products (category_id);

-- ============ PRICE LISTS ============
CREATE TABLE public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  price numeric(14,4) NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (product_id, price_list_id)
);

CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  old_price numeric(14,4),
  new_price numeric(14,4) NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_history_product_idx ON public.price_history (product_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.price_history (product_id, price_list_id, old_price, new_price, changed_by)
    VALUES (NEW.product_id, NEW.price_list_id, NULL, NEW.price, auth.uid());
  ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.price_history (product_id, price_list_id, old_price, new_price, changed_by)
    VALUES (NEW.product_id, NEW.price_list_id, OLD.price, NEW.price, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_prices_history
  AFTER INSERT OR UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.log_price_change();

-- ============ SUPPLIERS / CUSTOMERS ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  business_name text NOT NULL,
  rfc text,
  contact_name text,
  email text,
  phone text,
  address text,
  payment_terms_days integer NOT NULL DEFAULT 0,
  lead_time_days integer NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  business_name text NOT NULL,
  rfc text,
  contact_name text,
  email text,
  phone text,
  address text,
  price_list_id uuid REFERENCES public.price_lists(id) ON DELETE SET NULL,
  credit_days integer NOT NULL DEFAULT 0,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- ============ GRANTS + RLS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.price_lists, public.product_prices, public.suppliers, public.customers TO authenticated;
GRANT SELECT ON public.price_history TO authenticated;
GRANT ALL ON public.products, public.price_lists, public.product_prices, public.price_history, public.suppliers, public.customers TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- products: everyone signed-in can read (costs are filtered through a view for ventas)
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_write" ON public.products FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','compras']::public.app_role[]));

-- price lists / prices: admin + ventas manage, all read
CREATE POLICY "price_lists_select" ON public.price_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "price_lists_write" ON public.price_lists FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]));

CREATE POLICY "product_prices_select" ON public.product_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_prices_write" ON public.product_prices FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]));

CREATE POLICY "price_history_select" ON public.price_history FOR SELECT TO authenticated USING (true);

-- suppliers: hidden from ventas
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]));
CREATE POLICY "suppliers_write" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','compras']::public.app_role[]));

-- customers: admin + ventas manage, compras/almacen read
CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_write" ON public.customers FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]));

-- updated_at / created_by triggers
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER price_lists_updated_at BEFORE UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_prices_updated_at BEFORE UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_created_by BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER price_lists_created_by BEFORE INSERT ON public.price_lists FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER product_prices_created_by BEFORE INSERT ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER suppliers_created_by BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER customers_created_by BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_created_by();