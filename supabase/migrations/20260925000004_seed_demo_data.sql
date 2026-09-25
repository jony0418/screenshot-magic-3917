-- first registered user becomes admin; others get 'ventas' by default
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_role();

-- allow admins to manage roles
CREATE POLICY "user_roles_write_admin" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- ================= SEED =================
INSERT INTO public.company_settings (business_name, rfc, address, phone, email)
VALUES ('Distribuidora Ejemplo S.A. de C.V.', 'DEJ120101ABC', 'Av. Principal 123, Col. Centro, CDMX', '55 1234 5678', 'ventas@ejemplo.mx');

INSERT INTO public.warehouses (code, name, is_default) VALUES ('PRINCIPAL', 'Almacén Principal', true);

INSERT INTO public.categories (name) VALUES
  ('Abarrotes'), ('Limpieza'), ('Papelería'), ('Ferretería'), ('Bebidas');

INSERT INTO public.units (code, name) VALUES
  ('PZA', 'Pieza'), ('KG', 'Kilogramo'), ('LT', 'Litro'), ('CAJA', 'Caja'), ('MT', 'Metro');

INSERT INTO public.price_lists (name, is_default) VALUES ('Público', true), ('Mayoreo', false);

-- 20 products
INSERT INTO public.products (sku, barcode, name, category_id, unit_id, brand, min_stock, max_stock, avg_cost, last_cost)
SELECT d.sku, d.barcode, d.name,
       (SELECT id FROM public.categories WHERE name = d.category),
       (SELECT id FROM public.units WHERE code = d.unit),
       d.brand, d.min_stock, d.max_stock, d.cost, d.cost
FROM (VALUES
  ('ABA-001','7501000000011','Arroz blanco 1 kg','Abarrotes','KG','La Merced',20,200,18.5),
  ('ABA-002','7501000000028','Frijol negro 1 kg','Abarrotes','KG','La Merced',20,200,24.0),
  ('ABA-003','7501000000035','Azúcar estándar 1 kg','Abarrotes','KG','Zulka',15,150,22.5),
  ('ABA-004','7501000000042','Aceite vegetal 1 L','Abarrotes','LT','Nutrioli',10,120,33.0),
  ('ABA-005','7501000000059','Sal de mesa 1 kg','Abarrotes','KG','La Fina',10,100,9.5),
  ('LIM-001','7501000000066','Cloro 1 L','Limpieza','LT','Cloralex',12,120,17.0),
  ('LIM-002','7501000000073','Detergente 1 kg','Limpieza','KG','Roma',12,120,21.0),
  ('LIM-003','7501000000080','Jabón líquido 1 L','Limpieza','LT','Axion',8,80,28.0),
  ('LIM-004','7501000000097','Fibra multiusos','Limpieza','PZA','Scotch',20,200,6.5),
  ('PAP-001','7501000000103','Cuaderno profesional 100 h','Papelería','PZA','Scribe',15,150,27.0),
  ('PAP-002','7501000000110','Caja de bolígrafos negros','Papelería','CAJA','Bic',10,60,85.0),
  ('PAP-003','7501000000127','Paquete hojas blancas 500','Papelería','PZA','Xerox',10,80,98.0),
  ('FER-001','7501000000134','Cinta de aislar','Ferretería','PZA','Truper',20,200,12.0),
  ('FER-002','7501000000141','Cable uso rudo 1 m','Ferretería','MT','Condumex',30,300,15.5),
  ('FER-003','7501000000158','Martillo 16 oz','Ferretería','PZA','Truper',5,40,135.0),
  ('FER-004','7501000000165','Desarmador plano','Ferretería','PZA','Truper',8,60,45.0),
  ('BEB-001','7501000000172','Agua natural 1 L','Bebidas','LT','Bonafont',24,400,8.0),
  ('BEB-002','7501000000189','Refresco cola 600 ml','Bebidas','PZA','Coca-Cola',24,400,13.5),
  ('BEB-003','7501000000196','Jugo de naranja 1 L','Bebidas','LT','Del Valle',12,160,19.0),
  ('BEB-004','7501000000202','Café soluble 200 g','Bebidas','PZA','Nescafé',6,60,78.0)
) AS d(sku, barcode, name, category, unit, brand, min_stock, max_stock, cost);

-- prices: Público = cost * 1.35, Mayoreo = cost * 1.18
INSERT INTO public.product_prices (product_id, price_list_id, price)
SELECT p.id, pl.id,
       round(p.avg_cost * CASE WHEN pl.name = 'Público' THEN 1.35 ELSE 1.18 END, 2)
FROM public.products p CROSS JOIN public.price_lists pl;

-- suppliers
INSERT INTO public.suppliers (code, business_name, rfc, contact_name, email, phone, address, payment_terms_days, lead_time_days) VALUES
  ('PRV-001','Abarrotes del Centro S.A.','ADC950101AA1','Luis Méndez','compras@abarrotescentro.mx','55 1111 2222','Calle 5 de Mayo 45, CDMX',30,3),
  ('PRV-002','Limpieza Industrial del Norte','LIN020202BB2','Karla Ruiz','ventas@limpienorte.mx','81 3333 4444','Av. Industrial 900, Monterrey',15,5),
  ('PRV-003','Papelera Mayorista S. de R.L.','PMA100303CC3','Jorge Salinas','pedidos@papelmayorista.mx','33 5555 6666','Blvd. López Mateos 200, Guadalajara',30,4),
  ('PRV-004','Ferretería Mayoreo Bajío','FMB980404DD4','Ana Torres','ana@ferrebajio.mx','477 777 8888','Carretera León-Silao km 5, León',45,7),
  ('PRV-005','Bebidas y Distribución MX','BDM150505EE5','Raúl Cortés','raul@bebidasmx.mx','55 9999 0000','Calz. de Tlalpan 1500, CDMX',20,2);

-- customers
INSERT INTO public.customers (code, business_name, rfc, contact_name, email, phone, address, price_list_id, credit_days, credit_limit) VALUES
  ('CLI-001','Tienda La Esquina','TLE110101FF1','María López','maria@laesquina.mx','55 2222 3333','Calle Morelos 10, CDMX',(SELECT id FROM public.price_lists WHERE name='Público'),0,0),
  ('CLI-002','Autoservicio El Ahorro','AEA120202GG2','Pedro Ramos','pedro@elahorro.mx','55 4444 5555','Av. Revolución 300, CDMX',(SELECT id FROM public.price_lists WHERE name='Mayoreo'),30,150000),
  ('CLI-003','Minisúper Los Pinos','MLP130303HH3','Sofía Hernández','sofia@lospinos.mx','722 666 7777','Av. Hidalgo 88, Toluca',(SELECT id FROM public.price_lists WHERE name='Mayoreo'),15,80000),
  ('CLI-004','Papelería Escolar Azteca','PEA140404II4','Diego Núñez','diego@azteca.mx','55 8888 9999','Calle Juárez 22, CDMX',(SELECT id FROM public.price_lists WHERE name='Público'),0,0),
  ('CLI-005','Comercial Ferretera Sur','CFS160606JJ5','Laura Gómez','laura@ferresur.mx','55 1212 3434','Eje 8 Sur 450, CDMX',(SELECT id FROM public.price_lists WHERE name='Mayoreo'),30,200000);

-- initial stock for every product in the main warehouse
INSERT INTO public.stock_levels (product_id, warehouse_id, qty_on_hand)
SELECT p.id, (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), 50
FROM public.products p;

INSERT INTO public.inventory_movements (product_id, warehouse_id, movement_type, qty, unit_cost, balance_after, reference_type, notes)
SELECT p.id, (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), 'ADJUST_IN', 50, p.avg_cost, 50, 'adjustment', 'Inventario inicial'
FROM public.products p;

-- ===== sample purchase orders =====
INSERT INTO public.purchase_orders (supplier_id, warehouse_id, order_date, expected_date, status, notes)
VALUES
  ((SELECT id FROM public.suppliers WHERE code='PRV-001'), (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), current_date - 5, current_date + 2, 'draft', 'Resurtido de abarrotes'),
  ((SELECT id FROM public.suppliers WHERE code='PRV-002'), (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), current_date - 10, current_date - 3, 'sent', 'Pedido de limpieza'),
  ((SELECT id FROM public.suppliers WHERE code='PRV-005'), (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), current_date - 20, current_date - 12, 'partial', 'Bebidas temporada');

INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, qty_ordered, qty_received, unit_cost)
SELECT po.id, p.id, 100, CASE WHEN po.status = 'partial' THEN 40 ELSE 0 END, p.last_cost
FROM public.purchase_orders po
JOIN public.products p ON p.sku IN (
  CASE po.status WHEN 'draft' THEN 'ABA-001' WHEN 'sent' THEN 'LIM-001' ELSE 'BEB-001' END,
  CASE po.status WHEN 'draft' THEN 'ABA-002' WHEN 'sent' THEN 'LIM-002' ELSE 'BEB-002' END
);

-- ===== sample sales orders =====
INSERT INTO public.sales_orders (customer_id, warehouse_id, order_date, status, notes)
VALUES
  ((SELECT id FROM public.customers WHERE code='CLI-001'), (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), current_date - 2, 'draft', 'Pedido mostrador'),
  ((SELECT id FROM public.customers WHERE code='CLI-002'), (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), current_date - 6, 'confirmed', 'Pedido semanal'),
  ((SELECT id FROM public.customers WHERE code='CLI-003'), (SELECT id FROM public.warehouses WHERE code='PRINCIPAL'), current_date - 12, 'partial', 'Surtido parcial');

INSERT INTO public.sales_order_lines (sales_order_id, product_id, qty_ordered, qty_shipped, unit_price, discount_pct)
SELECT so.id, p.id, 10, CASE WHEN so.status = 'partial' THEN 4 ELSE 0 END,
       (SELECT price FROM public.product_prices pp
          JOIN public.customers c ON c.id = so.customer_id
         WHERE pp.product_id = p.id AND pp.price_list_id = c.price_list_id), 0
FROM public.sales_orders so
JOIN public.products p ON p.sku IN (
  CASE so.status WHEN 'draft' THEN 'ABA-003' WHEN 'confirmed' THEN 'PAP-001' ELSE 'FER-001' END,
  CASE so.status WHEN 'draft' THEN 'ABA-004' WHEN 'confirmed' THEN 'PAP-002' ELSE 'FER-002' END
);

-- reserve stock for the confirmed / partial sales orders
UPDATE public.stock_levels s
   SET qty_reserved = sub.qty
  FROM (
    SELECT l.product_id, so.warehouse_id, sum(l.qty_ordered - l.qty_shipped) AS qty
      FROM public.sales_order_lines l
      JOIN public.sales_orders so ON so.id = l.sales_order_id
     WHERE so.status IN ('confirmed','partial')
     GROUP BY l.product_id, so.warehouse_id
  ) sub
 WHERE s.product_id = sub.product_id AND s.warehouse_id = sub.warehouse_id;