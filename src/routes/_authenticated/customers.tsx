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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { dateMX, money, SO_STATUS_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Clientes — Inventario MX" },
      {
        name: "description",
        content: "Directorio de clientes, lista de precios asignada e historial de ventas.",
      },
      { property: "og:title", content: "Clientes — Inventario MX" },
      {
        property: "og:description",
        content: "Directorio de clientes, lista de precios e historial de ventas.",
      },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "ventas"]);
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const priceLists = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_lists")
        .select("id, name, is_default")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const customers = useQuery({
    queryKey: ["customers", term],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("*, price_lists(name)")
        .order("business_name");
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
    queryKey: ["customer-orders", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, folio, order_date, status, total")
        .eq("customer_id", selected!.id)
        .order("order_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createCustomer = useMutation({
    mutationFn: async (values: PartnerFormValues) => {
      const defaultList = priceLists.data?.find((l) => l.is_default);
      const { error } = await supabase.from("customers").insert({
        code: values.code,
        business_name: values.business_name,
        rfc: values.rfc || null,
        contact_name: values.contact_name || null,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        credit_days: values.terms_days,
        is_active: values.is_active,
        notes: values.notes || null,
        price_list_id: defaultList?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente creado");
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignList = useMutation({
    mutationFn: async ({ id, priceListId }: { id: string; priceListId: string }) => {
      const { error } = await supabase
        .from("customers")
        .update({ price_list_id: priceListId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista de precios actualizada");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = customers.data ?? [];

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Directorio, crédito y lista de precios"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                exportToCsv(
                  "clientes",
                  rows.map((r) => ({
                    codigo: r.code,
                    razon_social: r.business_name,
                    rfc: r.rfc ?? "",
                    contacto: r.contact_name ?? "",
                    correo: r.email ?? "",
                    telefono: r.phone ?? "",
                    lista_precios: r.price_lists?.name ?? "",
                    dias_credito: r.credit_days,
                    limite_credito: r.credit_limit,
                    estado: r.is_active ? "Activo" : "Inactivo",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            {canEdit ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
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
        {customers.isLoading ? (
          <LoadingState />
        ) : customers.error ? (
          <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
        ) : !rows.length ? (
          <EmptyState description="Registra tu primer cliente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Razón social</th>
                  <th>RFC</th>
                  <th>Lista de precios</th>
                  <th className="text-right">Días crédito</th>
                  <th>Historial</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{row.code}</td>
                    <td className="font-medium">{row.business_name}</td>
                    <td className="num">{row.rfc ?? "—"}</td>
                    <td>
                      {canEdit ? (
                        <Select
                          value={row.price_list_id ?? ""}
                          onValueChange={(value) =>
                            assignList.mutate({ id: row.id, priceListId: value })
                          }
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue placeholder="Sin lista" />
                          </SelectTrigger>
                          <SelectContent>
                            {(priceLists.data ?? []).map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        (row.price_lists?.name ?? "—")
                      )}
                    </td>
                    <td className="num text-right">{row.credit_days}</td>
                    <td>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setSelected({ id: row.id, name: row.business_name })}
                      >
                        Ver órdenes
                      </button>
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
            <SheetDescription>Historial de órdenes de venta</SheetDescription>
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
                      <td>{SO_STATUS_LABEL[o.status] ?? o.status}</td>
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
        title="Nuevo cliente"
        termsLabel="Días de crédito"
        submitting={createCustomer.isPending}
        onSubmit={(values) => createCustomer.mutate(values)}
      />
    </div>
  );
}
