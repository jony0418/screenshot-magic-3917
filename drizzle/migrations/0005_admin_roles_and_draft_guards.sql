GRANT INSERT, DELETE ON public.user_roles TO authenticated;
CREATE POLICY user_roles_admin_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY user_roles_admin_delete ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin() AND user_id <> auth.uid());

CREATE OR REPLACE FUNCTION public.guard_draft_lines()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE st text; parent uuid;
BEGIN
  IF current_user <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'purchase_order_lines' THEN
    parent := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
    SELECT status::text INTO st FROM public.purchase_orders WHERE id = parent;
  ELSE
    parent := COALESCE(NEW.sales_order_id, OLD.sales_order_id);
    SELECT status::text INTO st FROM public.sales_orders WHERE id = parent;
  END IF;
  IF st IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Solo se pueden modificar órdenes en borrador';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER po_lines_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_draft_lines();
CREATE TRIGGER so_lines_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_draft_lines();

CREATE OR REPLACE FUNCTION public.guard_draft_orders()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF OLD.status::text <> 'draft' THEN
    IF TG_TABLE_NAME = 'purchase_orders' AND OLD.status::text = 'sent' AND NEW.status::text = 'sent' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Una orden que ya no está en borrador no se puede editar; solo cancelar';
  END IF;
  IF NEW.status::text NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'Usa las acciones del sistema para cambiar el estado de la orden';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER po_draft_guard BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_draft_orders();
CREATE TRIGGER so_draft_guard BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_draft_orders();