import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { PartnerFormDialog, type PartnerFormValues } from "@/components/partner-form-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/table-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csv";
import { dateMX, money, PO_STATUS_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Proveedores — Coimbec" },
      { name: "description", content: "Directorio de proveedores y su historial de compras." },
      { property: "og:title", content: "Proveedores — Coimbec" },
      {
        property: "og:description",
        content: "Directorio de proveedores y su historial de compras.",
      },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "compras"]);
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const suppliers = useQuery({
    queryKey: ["suppliers", term],
    queryFn: async () => {
      let query = supabase.from("suppliers").select("*").order("business_name");
      if (term.trim()) {
        const like = `%${term.trim()}%`;
        query = query.or(`business_name.ilike.${like},code.ilike.${like},rfc.ilike.${like}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const orders = useQuery({
    queryKey: ["supplier-orders", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, folio, order_date, status, total")
        .eq("supplier_id", selected!.id)
        .order("order_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createSupplier = useMutation({
    mutationFn: async (values: PartnerFormValues) => {
      const { error } = await supabase.from("suppliers").insert({
        code: values.code,
        business_name: values.business_name,
        rfc: values.rfc || null,
        contact_name: values.contact_name || null,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        payment_terms_days: values.terms_days,
        is_active: values.is_active,
        notes: values.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Proveedor creado");
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = suppliers.data ?? [];

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="Directorio y condiciones comerciales"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                exportToCsv(
                  "proveedores",
                  rows.map((r) => ({
                    codigo: r.code,
                    razon_social: r.business_name,
                    rfc: r.rfc ?? "",
                    contacto: r.contact_name ?? "",
                    correo: r.email ?? "",
                    telefono: r.phone ?? "",
                    dias_credito: r.payment_terms_days,
                    dias_entrega: r.lead_time_days,
                    estado: r.is_active ? "Activo" : "Inactivo",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            {canEdit ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo proveedor
              </Button>
            ) : null}
          </>
        }
      />

      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar por nombre, código o RFC"
        className="mb-3 max-w-xs"
        maxLength={80}
      />

      <div className="rounded-lg border border-border bg-card">
        {suppliers.isLoading ? (
          <LoadingState />
        ) : suppliers.error ? (
          <ErrorState error={suppliers.error} onRetry={() => void suppliers.refetch()} />
        ) : !rows.length ? (
          <EmptyState description="Registra tu primer proveedor." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Razón social</th>
                  <th>RFC</th>
                  <th>Contacto</th>
                  <th>Teléfono</th>
                  <th className="text-right">Días crédito</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => setSelected({ id: row.id, name: row.business_name })}
                  >
                    <td className="num">{row.code}</td>
                    <td className="font-medium">{row.business_name}</td>
                    <td className="num">{row.rfc ?? "—"}</td>
                    <td>{row.contact_name ?? "—"}</td>
                    <td className="num">{row.phone ?? "—"}</td>
                    <td className="num text-right">{row.payment_terms_days}</td>
                    <td className={row.is_active ? "text-success" : "text-muted-foreground"}>
                      {row.is_active ? "Activo" : "Inactivo"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>Historial de órdenes de compra</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            {orders.isLoading ? (
              <LoadingState />
            ) : !orders.data?.length ? (
              <EmptyState description="Sin órdenes registradas." />
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.map((o) => (
                    <tr key={o.id}>
                      <td className="num">{o.folio}</td>
                      <td className="num">{dateMX(o.order_date)}</td>
                      <td>{PO_STATUS_LABEL[o.status] ?? o.status}</td>
                      <td className="num text-right">{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PartnerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nuevo proveedor"
        termsLabel="Días de crédito"
        submitting={createSupplier.isPending}
        onSubmit={(values) => createSupplier.mutate(values)}
      />
    </div>
  );
}
