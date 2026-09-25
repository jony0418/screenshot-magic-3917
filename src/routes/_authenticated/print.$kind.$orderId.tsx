import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/table-states";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dateMX, money, PO_STATUS_LABEL, qty, SO_STATUS_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/print/$kind/$orderId")({
  head: () => ({
    meta: [
      { title: "Impresión de orden — Coimbec" },
      { name: "description", content: "Vista imprimible de órdenes de compra y venta." },
      { property: "og:title", content: "Impresión de orden — Coimbec" },
      { property: "og:description", content: "Vista imprimible de órdenes de compra y venta." },
    ],
  }),
  component: PrintPage,
});

type PrintLine = { id: string; sku: string; name: string; qty: number; price: number; total: number };
type PrintDoc = {
  title: string;
  folio: string;
  date: string;
  status: string;
  partyLabel: string;
  party: { business_name: string; rfc: string | null; address: string | null; phone: string | null; email: string | null } | null;
  warehouse: string;
  notes: string | null;
  lines: PrintLine[];
  subtotal: number;
  tax: number;
  total: number;
  priceLabel: string;
};

function PrintPage() {
  const { kind, orderId } = Route.useParams();
  const router = useRouter();

  const company = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const doc = useQuery({
    queryKey: ["print", kind, orderId],
    queryFn: async (): Promise<PrintDoc> => {
      if (kind === "po") {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select("*, suppliers(business_name, rfc, address, phone, email), warehouses(code, name), purchase_order_lines(*, products(sku, name))")
          .eq("id", orderId)
          .single();
        if (error) throw error;
        return {
          title: "Orden de compra",
          folio: data.folio,
          date: data.order_date,
          status: PO_STATUS_LABEL[data.status],
          partyLabel: "Proveedor",
          party: data.suppliers,
          warehouse: data.warehouses?.name ?? "",
          notes: data.notes,
          priceLabel: "Costo unit.",
          lines: data.purchase_order_lines.map((l) => ({
            id: l.id,
            sku: l.products?.sku ?? "",
            name: l.products?.name ?? "",
            qty: l.qty_ordered,
            price: l.unit_cost,
            total: l.line_total,
          })),
          subtotal: data.subtotal,
          tax: data.tax,
          total: data.total,
        };
      }
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*, customers(business_name, rfc, address, phone, email), warehouses(code, name), sales_order_lines(*, products(sku, name))")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return {
        title: "Orden de venta",
        folio: data.folio,
        date: data.order_date,
        status: SO_STATUS_LABEL[data.status],
        partyLabel: "Cliente",
        party: data.customers,
        warehouse: data.warehouses?.name ?? "",
        notes: data.notes,
        priceLabel: "Precio unit.",
        lines: data.sales_order_lines.map((l) => ({
          id: l.id,
          sku: l.products?.sku ?? "",
          name: l.products?.name ?? "",
          qty: l.qty_ordered,
          price: l.unit_price,
          total: l.line_total,
        })),
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
      };
    },
  });

  if (doc.isLoading) return <LoadingState />;
  if (doc.error) return <ErrorState error={doc.error} onRetry={() => doc.refetch()} />;
  const d = doc.data!;
  const c = company.data;

  return (
    <div>
      <div className="no-print mb-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Regresar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>
      <div className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-8 text-sm print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">{c?.business_name ?? "Coimbec"}</p>
            {c?.rfc ? <p>RFC: {c.rfc}</p> : null}
            {c?.address ? <p className="text-muted-foreground">{c.address}</p> : null}
            <p className="text-muted-foreground">{[c?.phone, c?.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">{d.title}</p>
            <p className="num text-base">{d.folio}</p>
            <p>Fecha: {dateMX(d.date)}</p>
            <p>Estado: {d.status}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 py-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">{d.partyLabel}</p>
            <p className="font-medium">{d.party?.business_name}</p>
            {d.party?.rfc ? <p>RFC: {d.party.rfc}</p> : null}
            {d.party?.address ? <p>{d.party.address}</p> : null}
            <p>{[d.party?.phone, d.party?.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Almacén</p>
            <p>{d.warehouse}</p>
          </div>
        </div>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">{d.priceLabel}</th>
              <th className="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.id}>
                <td className="num">{l.sku}</td>
                <td>{l.name}</td>
                <td className="num text-right">{qty(l.qty)}</td>
                <td className="num text-right">{money(l.price)}</td>
                <td className="num text-right">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 grid w-60 grid-cols-2 gap-y-0.5">
          <dt>Subtotal</dt>
          <dd className="num text-right">{money(d.subtotal)}</dd>
          <dt>IVA 16%</dt>
          <dd className="num text-right">{money(d.tax)}</dd>
          <dt className="font-semibold">Total MXN</dt>
          <dd className="num text-right font-semibold">{money(d.total)}</dd>
        </dl>
        {d.notes ? <p className="mt-6 text-muted-foreground">Notas: {d.notes}</p> : null}
      </div>
    </div>
  );
}
