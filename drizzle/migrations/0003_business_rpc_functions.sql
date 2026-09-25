-- view for roles that must not see costs
CREATE VIEW public.products_public WITH (security_invoker = true) AS
  SELECT id, sku, barcode, name, description, category_id, unit_id, brand,
         min_stock, max_stock, tax_rate, image_url, notes, is_active, created_at, updated_at
    FROM public.products;
GRANT SELECT ON public.products_public TO authenticated;

-- internal: apply a stock movement + kardex entry
CREATE OR REPLACE FUNCTION public.apply_movement(
  _product_id uuid, _warehouse_id uuid, _type public.movement_type,
  _qty numeric, _unit_cost numeric, _ref_type text, _ref_id uuid, _notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_balance numeric(14,3);
BEGIN
  INSERT INTO public.stock_levels (product_id, warehouse_id, qty_on_hand)
  VALUES (_product_id, _warehouse_id, 0)
  ON CONFLICT (product_id, warehouse_id) DO NOTHING;

  UPDATE public.stock_levels
     SET qty_on_hand = qty_on_hand + _qty, updated_at = now()
   WHERE product_id = _product_id AND warehouse_id = _warehouse_id
  RETURNING qty_on_hand INTO new_balance;

  IF new_balance < 0 THEN
    RAISE EXCEPTION 'No hay existencia suficiente del producto (resultado negativo)';
  END IF;

  INSERT INTO public.inventory_movements
    (product_id, warehouse_id, movement_type, qty, unit_cost, balance_after, reference_type, reference_id, notes, created_by)
  VALUES (_product_id, _warehouse_id, _type, _qty, _unit_cost, new_balance, _ref_type, _ref_id, _notes, auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.apply_movement(uuid, uuid, public.movement_type, numeric, numeric, text, uuid, text) FROM public, authenticated;

-- 1. RECEIVE PURCHASE ORDER
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  _purchase_order_id uuid, _lines jsonb, _receipt_date date DEFAULT current_date, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  po public.purchase_orders;
  receipt_id uuid;
  item jsonb;
  pol public.purchase_order_lines;
  qty numeric(14,3);
  cost numeric(14,4);
  qty_before numeric(14,3);
  prod public.products;
  pending numeric(14,3);
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','compras','almacen']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar recepciones';
  END IF;

  SELECT * INTO po FROM public.purchase_orders WHERE id = _purchase_order_id FOR UPDATE;
  IF po.id IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF po.status IN ('cancelled','received') THEN
    RAISE EXCEPTION 'La orden de compra ya está % y no admite recepciones', po.status;
  END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Debes capturar al menos una línea a recibir';
  END IF;

  INSERT INTO public.goods_receipts (purchase_order_id, warehouse_id, receipt_date, notes, created_by)
  VALUES (po.id, po.warehouse_id, COALESCE(_receipt_date, current_date), _notes, auth.uid())
  RETURNING id INTO receipt_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    qty := (item->>'qty')::numeric;
    IF qty IS NULL OR qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO pol FROM public.purchase_order_lines
     WHERE id = (item->>'purchase_order_line_id')::uuid AND purchase_order_id = po.id FOR UPDATE;
    IF pol.id IS NULL THEN RAISE EXCEPTION 'Línea de orden de compra no válida'; END IF;

    pending := pol.qty_ordered - pol.qty_received;
    IF qty > pending THEN
      RAISE EXCEPTION 'La cantidad a recibir (%) excede lo pendiente (%)', qty, pending;
    END IF;

    cost := COALESCE(NULLIF((item->>'unit_cost'), '')::numeric, pol.unit_cost);

    SELECT * INTO prod FROM public.products WHERE id = pol.product_id FOR UPDATE;
    SELECT COALESCE(sum(qty_on_hand), 0) INTO qty_before FROM public.stock_levels WHERE product_id = prod.id;

    UPDATE public.products
       SET avg_cost = CASE WHEN qty_before + qty > 0
                           THEN round(((qty_before * prod.avg_cost) + (qty * cost)) / (qty_before + qty), 4)
                           ELSE cost END,
           last_cost = cost,
           updated_at = now()
     WHERE id = prod.id;

    INSERT INTO public.goods_receipt_lines
      (goods_receipt_id, purchase_order_line_id, product_id, qty, unit_cost, created_by)
    VALUES (receipt_id, pol.id, pol.product_id, qty, cost, auth.uid());

    PERFORM public.apply_movement(pol.product_id, po.warehouse_id, 'IN_PURCHASE', qty, cost,
      'goods_receipt', receipt_id, 'Recepción de ' || po.folio);

    UPDATE public.purchase_order_lines SET qty_received = qty_received + qty, updated_at = now() WHERE id = pol.id;
  END LOOP;

  UPDATE public.purchase_orders
     SET status = CASE
           WHEN NOT EXISTS (SELECT 1 FROM public.purchase_order_lines
                             WHERE purchase_order_id = po.id AND qty_received < qty_ordered) THEN 'received'::public.po_status
           ELSE 'partial'::public.po_status END,
         updated_at = now()
   WHERE id = po.id;

  RETURN receipt_id;
END;
$$;

-- 2. CONFIRM SALES ORDER
CREATE OR REPLACE FUNCTION public.confirm_sales_order(_sales_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  so public.sales_orders;
  l record;
  available numeric(14,3);
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','ventas']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para confirmar órdenes de venta';
  END IF;

  SELECT * INTO so FROM public.sales_orders WHERE id = _sales_order_id FOR UPDATE;
  IF so.id IS NULL THEN RAISE EXCEPTION 'Orden de venta no encontrada'; END IF;
  IF so.status <> 'draft' THEN RAISE EXCEPTION 'Solo se pueden confirmar órdenes en borrador'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_lines WHERE sales_order_id = so.id) THEN
    RAISE EXCEPTION 'La orden no tiene líneas';
  END IF;

  FOR l IN SELECT * FROM public.sales_order_lines WHERE sales_order_id = so.id LOOP
    INSERT INTO public.stock_levels (product_id, warehouse_id) VALUES (l.product_id, so.warehouse_id)
      ON CONFLICT (product_id, warehouse_id) DO NOTHING;

    SELECT qty_on_hand - qty_reserved INTO available FROM public.stock_levels
     WHERE product_id = l.product_id AND warehouse_id = so.warehouse_id FOR UPDATE;

    IF COALESCE(available, 0) < l.qty_ordered THEN
      RAISE EXCEPTION 'Existencia insuficiente del producto % (disponible %, requerido %)',
        (SELECT sku FROM public.products WHERE id = l.product_id), COALESCE(available,0), l.qty_ordered;
    END IF;

    UPDATE public.stock_levels SET qty_reserved = qty_reserved + l.qty_ordered, updated_at = now()
     WHERE product_id = l.product_id AND warehouse_id = so.warehouse_id;
  END LOOP;

  UPDATE public.sales_orders SET status = 'confirmed', updated_at = now() WHERE id = so.id;
END;
$$;

-- 3. SHIP SALES ORDER
CREATE OR REPLACE FUNCTION public.ship_sales_order(
  _sales_order_id uuid, _lines jsonb, _shipment_date date DEFAULT current_date, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  so public.sales_orders;
  shipment_id uuid;
  item jsonb;
  sol public.sales_order_lines;
  qty numeric(14,3);
  cost numeric(14,4);
  pending numeric(14,3);
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','almacen']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para surtir órdenes de venta';
  END IF;

  SELECT * INTO so FROM public.sales_orders WHERE id = _sales_order_id FOR UPDATE;
  IF so.id IS NULL THEN RAISE EXCEPTION 'Orden de venta no encontrada'; END IF;
  IF so.status NOT IN ('confirmed','partial') THEN
    RAISE EXCEPTION 'Solo se pueden surtir órdenes confirmadas o parciales';
  END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'Debes capturar al menos una línea a surtir';
  END IF;

  INSERT INTO public.shipments (sales_order_id, warehouse_id, shipment_date, notes, created_by)
  VALUES (so.id, so.warehouse_id, COALESCE(_shipment_date, current_date), _notes, auth.uid())
  RETURNING id INTO shipment_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    qty := (item->>'qty')::numeric;
    IF qty IS NULL OR qty <= 0 THEN CONTINUE; END IF;

    SELECT * INTO sol FROM public.sales_order_lines
     WHERE id = (item->>'sales_order_line_id')::uuid AND sales_order_id = so.id FOR UPDATE;
    IF sol.id IS NULL THEN RAISE EXCEPTION 'Línea de orden de venta no válida'; END IF;

    pending := sol.qty_ordered - sol.qty_shipped;
    IF qty > pending THEN
      RAISE EXCEPTION 'La cantidad a surtir (%) excede lo pendiente (%)', qty, pending;
    END IF;

    SELECT avg_cost INTO cost FROM public.products WHERE id = sol.product_id;

    UPDATE public.stock_levels
       SET qty_reserved = greatest(qty_reserved - qty, 0), updated_at = now()
     WHERE product_id = sol.product_id AND warehouse_id = so.warehouse_id;

    PERFORM public.apply_movement(sol.product_id, so.warehouse_id, 'OUT_SALE', -qty, cost,
      'shipment', shipment_id, 'Salida de ' || so.folio);

    INSERT INTO public.shipment_lines (shipment_id, sales_order_line_id, product_id, qty, unit_cost, created_by)
    VALUES (shipment_id, sol.id, sol.product_id, qty, cost, auth.uid());

    UPDATE public.sales_order_lines SET qty_shipped = qty_shipped + qty, updated_at = now() WHERE id = sol.id;
  END LOOP;

  UPDATE public.sales_orders
     SET status = CASE
           WHEN NOT EXISTS (SELECT 1 FROM public.sales_order_lines
                             WHERE sales_order_id = so.id AND qty_shipped < qty_ordered) THEN 'shipped'::public.so_status
           ELSE 'partial'::public.so_status END,
         updated_at = now()
   WHERE id = so.id;

  RETURN shipment_id;
END;
$$;

-- 4a. CANCEL PURCHASE ORDER
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(_purchase_order_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  po public.purchase_orders;
  l record;
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','compras']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para cancelar órdenes de compra';
  END IF;

  SELECT * INTO po FROM public.purchase_orders WHERE id = _purchase_order_id FOR UPDATE;
  IF po.id IS NULL THEN RAISE EXCEPTION 'Orden de compra no encontrada'; END IF;
  IF po.status = 'cancelled' THEN RAISE EXCEPTION 'La orden ya está cancelada'; END IF;

  -- reverse anything already received
  FOR l IN SELECT * FROM public.purchase_order_lines WHERE purchase_order_id = po.id AND qty_received > 0 LOOP
    PERFORM public.apply_movement(l.product_id, po.warehouse_id, 'CANCEL_REVERSAL', -l.qty_received, l.unit_cost,
      'purchase_order', po.id, COALESCE(_reason, 'Cancelación de ' || po.folio));
    UPDATE public.purchase_order_lines SET qty_received = 0, updated_at = now() WHERE id = l.id;
  END LOOP;

  UPDATE public.purchase_orders SET status = 'cancelled', notes = COALESCE(notes,'') ||
    CASE WHEN _reason IS NULL THEN '' ELSE E'\nCancelada: ' || _reason END, updated_at = now()
   WHERE id = po.id;
END;
$$;

-- 4b. CANCEL SALES ORDER
CREATE OR REPLACE FUNCTION public.cancel_sales_order(_sales_order_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  so public.sales_orders;
  l record;
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','ventas']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para cancelar órdenes de venta';
  END IF;

  SELECT * INTO so FROM public.sales_orders WHERE id = _sales_order_id FOR UPDATE;
  IF so.id IS NULL THEN RAISE EXCEPTION 'Orden de venta no encontrada'; END IF;
  IF so.status = 'cancelled' THEN RAISE EXCEPTION 'La orden ya está cancelada'; END IF;

  FOR l IN SELECT * FROM public.sales_order_lines WHERE sales_order_id = so.id LOOP
    -- release reservations of what was not shipped yet
    IF so.status IN ('confirmed','partial') AND l.qty_ordered - l.qty_shipped > 0 THEN
      UPDATE public.stock_levels
         SET qty_reserved = greatest(qty_reserved - (l.qty_ordered - l.qty_shipped), 0), updated_at = now()
       WHERE product_id = l.product_id AND warehouse_id = so.warehouse_id;
    END IF;
    -- reverse shipped quantities back into stock
    IF l.qty_shipped > 0 THEN
      PERFORM public.apply_movement(l.product_id, so.warehouse_id, 'CANCEL_REVERSAL', l.qty_shipped,
        (SELECT avg_cost FROM public.products WHERE id = l.product_id),
        'sales_order', so.id, COALESCE(_reason, 'Cancelación de ' || so.folio));
      UPDATE public.sales_order_lines SET qty_shipped = 0, updated_at = now() WHERE id = l.id;
    END IF;
  END LOOP;

  UPDATE public.sales_orders SET status = 'cancelled', notes = COALESCE(notes,'') ||
    CASE WHEN _reason IS NULL THEN '' ELSE E'\nCancelada: ' || _reason END, updated_at = now()
   WHERE id = so.id;
END;
$$;

-- 5. MANUAL ADJUSTMENT
CREATE OR REPLACE FUNCTION public.adjust_inventory(
  _product_id uuid, _warehouse_id uuid, _qty numeric, _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cost numeric(14,4);
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','almacen']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para ajustar inventario';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio';
  END IF;
  IF _qty IS NULL OR _qty = 0 THEN
    RAISE EXCEPTION 'La cantidad del ajuste debe ser distinta de cero';
  END IF;

  SELECT avg_cost INTO cost FROM public.products WHERE id = _product_id;
  PERFORM public.apply_movement(_product_id, _warehouse_id,
    CASE WHEN _qty > 0 THEN 'ADJUST_IN'::public.movement_type ELSE 'ADJUST_OUT'::public.movement_type END,
    _qty, COALESCE(cost, 0), 'adjustment', NULL, _reason);
END;
$$;

-- 6. BULK PRICE UPDATE
CREATE OR REPLACE FUNCTION public.bulk_update_prices(
  _price_list_id uuid, _pct numeric, _category_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT public.has_any_role(ARRAY['admin','ventas']::public.app_role[]) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar precios';
  END IF;

  UPDATE public.product_prices pp
     SET price = round(pp.price * (1 + _pct / 100.0), 4), updated_at = now()
   WHERE pp.price_list_id = _price_list_id
     AND (_category_id IS NULL OR EXISTS (
       SELECT 1 FROM public.products p WHERE p.id = pp.product_id AND p.category_id = _category_id));
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 7. DASHBOARD
CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  SELECT jsonb_build_object(
    'inventory_value', (SELECT COALESCE(sum(s.qty_on_hand * p.avg_cost), 0)
                          FROM public.stock_levels s JOIN public.products p ON p.id = s.product_id),
    'low_stock_count', (SELECT count(*) FROM public.products p
                         WHERE p.is_active
                           AND p.min_stock > 0
                           AND COALESCE((SELECT sum(qty_on_hand) FROM public.stock_levels WHERE product_id = p.id), 0) < p.min_stock),
    'open_purchase_orders', (SELECT count(*) FROM public.purchase_orders WHERE status IN ('draft','sent','partial')),
    'open_sales_orders', (SELECT count(*) FROM public.sales_orders WHERE status IN ('confirmed','partial')),
    'sales_this_month', (SELECT COALESCE(sum(total), 0) FROM public.sales_orders
                          WHERE status <> 'cancelled' AND order_date >= date_trunc('month', current_date))
  ) INTO res;
  RETURN res;
END;
$$;

-- 8. LOW STOCK LIST
CREATE OR REPLACE FUNCTION public.low_stock_products()
RETURNS TABLE (id uuid, sku text, name text, min_stock numeric, qty_on_hand numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.sku, p.name, p.min_stock,
         COALESCE((SELECT sum(qty_on_hand) FROM public.stock_levels WHERE product_id = p.id), 0)
    FROM public.products p
   WHERE p.is_active AND p.min_stock > 0
     AND COALESCE((SELECT sum(qty_on_hand) FROM public.stock_levels WHERE product_id = p.id), 0) < p.min_stock
   ORDER BY p.name
$$;

GRANT EXECUTE ON FUNCTION
  public.receive_purchase_order(uuid, jsonb, date, text),
  public.confirm_sales_order(uuid),
  public.ship_sales_order(uuid, jsonb, date, text),
  public.cancel_purchase_order(uuid, text),
  public.cancel_sales_order(uuid, text),
  public.adjust_inventory(uuid, uuid, numeric, text),
  public.bulk_update_prices(uuid, numeric, uuid),
  public.dashboard_summary(),
  public.low_stock_products()
TO authenticated;