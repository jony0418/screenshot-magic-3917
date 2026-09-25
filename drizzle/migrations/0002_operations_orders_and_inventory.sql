-- ============ FOLIO SEQUENCES ============
CREATE SEQUENCE public.purchase_order_folio_seq;
CREATE SEQUENCE public.sales_order_folio_seq;
CREATE SEQUENCE public.goods_receipt_folio_seq;
CREATE SEQUENCE public.shipment_folio_seq;

-- ============ PURCHASE ORDERS ============
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  order_date date NOT NULL DEFAULT current_date,
  expected_date date,
  status public.po_status NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_ordered numeric(14,3) NOT NULL CHECK (qty_ordered > 0),
  qty_received numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX po_lines_order_idx ON public.purchase_order_lines (purchase_order_id);

CREATE TABLE public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  receipt_date date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX gr_lines_receipt_idx ON public.goods_receipt_lines (goods_receipt_id);

-- ============ SALES ORDERS ============
CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  order_date date NOT NULL DEFAULT current_date,
  status public.so_status NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_ordered numeric(14,3) NOT NULL CHECK (qty_ordered > 0),
  qty_shipped numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX so_lines_order_idx ON public.sales_order_lines (sales_order_id);

CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  shipment_date date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.shipment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  sales_order_line_id uuid NOT NULL REFERENCES public.sales_order_lines(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX shipment_lines_shipment_idx ON public.shipment_lines (shipment_id);

-- ============ INVENTORY ============
CREATE TABLE public.stock_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  qty_on_hand numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  qty_reserved numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse_id)
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  movement_type public.movement_type NOT NULL,
  qty numeric(14,3) NOT NULL,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  balance_after numeric(14,3) NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX inventory_movements_product_idx ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX inventory_movements_ref_idx ON public.inventory_movements (reference_type, reference_id);

-- ============ FOLIO TRIGGERS ============
CREATE OR REPLACE FUNCTION public.assign_folio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  prefix text := TG_ARGV[0];
  seq_name text := TG_ARGV[1];
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    NEW.folio := prefix || '-' || lpad(nextval(seq_name)::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_orders_folio BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_folio('OC', 'public.purchase_order_folio_seq');
CREATE TRIGGER sales_orders_folio BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_folio('OV', 'public.sales_order_folio_seq');
CREATE TRIGGER goods_receipts_folio BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.assign_folio('REC', 'public.goods_receipt_folio_seq');
CREATE TRIGGER shipments_folio BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.assign_folio('SAL', 'public.shipment_folio_seq');

-- ============ LINE TOTALS ============
CREATE OR REPLACE FUNCTION public.compute_po_line_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.line_total := round(NEW.qty_ordered * NEW.unit_cost, 2);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_so_line_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.line_total := round(NEW.qty_ordered * NEW.unit_price * (1 - NEW.discount_pct / 100.0), 2);
  RETURN NEW;
END;
$$;

CREATE TRIGGER po_line_total BEFORE INSERT OR UPDATE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.compute_po_line_total();
CREATE TRIGGER so_line_total BEFORE INSERT OR UPDATE ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.compute_so_line_total();

-- recompute order totals whenever lines change
CREATE OR REPLACE FUNCTION public.recompute_po_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  oid uuid := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  s numeric(14,2);
  t numeric(14,2);
BEGIN
  SELECT COALESCE(sum(l.line_total), 0),
         COALESCE(sum(round(l.line_total * p.tax_rate, 2)), 0)
    INTO s, t
    FROM public.purchase_order_lines l
    JOIN public.products p ON p.id = l.product_id
   WHERE l.purchase_order_id = oid;
  UPDATE public.purchase_orders
     SET subtotal = s, tax = t, total = s + t, updated_at = now()
   WHERE id = oid;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_so_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  oid uuid := COALESCE(NEW.sales_order_id, OLD.sales_order_id);
  s numeric(14,2);
  t numeric(14,2);
BEGIN
  SELECT COALESCE(sum(l.line_total), 0),
         COALESCE(sum(round(l.line_total * p.tax_rate, 2)), 0)
    INTO s, t
    FROM public.sales_order_lines l
    JOIN public.products p ON p.id = l.product_id
   WHERE l.sales_order_id = oid;
  UPDATE public.sales_orders
     SET subtotal = s, tax = t, total = s + t, updated_at = now()
   WHERE id = oid;
  RETURN NULL;
END;
$$;

CREATE TRIGGER po_totals AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.recompute_po_totals();
CREATE TRIGGER so_totals AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.recompute_so_totals();

-- updated_at / created_by
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER purchase_order_lines_updated_at BEFORE UPDATE ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER goods_receipts_updated_at BEFORE UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sales_orders_updated_at BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sales_order_lines_updated_at BEFORE UPDATE ON public.sales_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shipments_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER stock_levels_updated_at BEFORE UPDATE ON public.stock_levels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER purchase_orders_created_by BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER purchase_order_lines_created_by BEFORE INSERT ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER goods_receipts_created_by BEFORE INSERT ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER goods_receipt_lines_created_by BEFORE INSERT ON public.goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER sales_orders_created_by BEFORE INSERT ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER sales_order_lines_created_by BEFORE INSERT ON public.sales_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER shipments_created_by BEFORE INSERT ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER shipment_lines_created_by BEFORE INSERT ON public.shipment_lines FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER inventory_movements_created_by BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

-- ============ GRANTS + RLS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.purchase_orders, public.purchase_order_lines,
  public.sales_orders, public.sales_order_lines TO authenticated;
GRANT SELECT ON public.goods_receipts, public.goods_receipt_lines, public.shipments, public.shipment_lines,
  public.stock_levels, public.inventory_movements TO authenticated;
GRANT ALL ON
  public.purchase_orders, public.purchase_order_lines, public.goods_receipts, public.goods_receipt_lines,
  public.sales_orders, public.sales_order_lines, public.shipments, public.shipment_lines,
  public.stock_levels, public.inventory_movements TO service_role;
GRANT USAGE ON SEQUENCE public.purchase_order_folio_seq, public.sales_order_folio_seq,
  public.goods_receipt_folio_seq, public.shipment_folio_seq TO authenticated, service_role;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- purchases: hidden from ventas (costs / suppliers)
CREATE POLICY "po_select" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]));
CREATE POLICY "po_write" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','compras']::public.app_role[]));

CREATE POLICY "po_lines_select" ON public.purchase_order_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]));
CREATE POLICY "po_lines_write" ON public.purchase_order_lines FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','compras']::public.app_role[]));

CREATE POLICY "gr_select" ON public.goods_receipts FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]));
CREATE POLICY "gr_lines_select" ON public.goods_receipt_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]));

-- sales: hidden from compras
CREATE POLICY "so_select" ON public.sales_orders FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas','almacen']::public.app_role[]));
CREATE POLICY "so_write" ON public.sales_orders FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]));

CREATE POLICY "so_lines_select" ON public.sales_order_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas','almacen']::public.app_role[]));
CREATE POLICY "so_lines_write" ON public.sales_order_lines FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','ventas']::public.app_role[]));

CREATE POLICY "shipments_select" ON public.shipments FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas','almacen']::public.app_role[]));
CREATE POLICY "shipment_lines_select" ON public.shipment_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','ventas','almacen']::public.app_role[]));

CREATE POLICY "stock_levels_select" ON public.stock_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_movements_select" ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]));