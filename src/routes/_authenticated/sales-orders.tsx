import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/table-states";

export const Route = createFileRoute("/_authenticated/sales-orders")({
  head: () => ({
    meta: [
      { title: "Órdenes de venta — Inventario MX" },
      { name: "description", content: "Órdenes de venta, confirmación de reservas y surtidos." },
      { property: "og:title", content: "Órdenes de venta — Inventario MX" },
      {
        property: "og:description",
        content: "Órdenes de venta, confirmación de reservas y surtidos.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Órdenes de venta" description="Ventas, reservas y surtidos" />
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          title="Próxima etapa"
          description="Esta pantalla se construye en la siguiente etapa: captura con precios por lista, confirmación y surtido."
        />
      </div>
    </div>
  ),
});
