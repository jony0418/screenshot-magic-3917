import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/table-states";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  head: () => ({
    meta: [
      { title: "Órdenes de compra — Inventario MX" },
      { name: "description", content: "Órdenes de compra, recepciones y costos por proveedor." },
      { property: "og:title", content: "Órdenes de compra — Inventario MX" },
      {
        property: "og:description",
        content: "Órdenes de compra, recepciones y costos por proveedor.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Órdenes de compra" description="Compras y recepciones de mercancía" />
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          title="Próxima etapa"
          description="Esta pantalla se construye en la siguiente etapa: alta de órdenes, líneas dinámicas y recepción de mercancía."
        />
      </div>
    </div>
  ),
});
