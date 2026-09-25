import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/table-states";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configuración — Inventario MX" },
      { name: "description", content: "Usuarios, roles, almacenes, categorías, unidades y empresa." },
      { property: "og:title", content: "Configuración — Inventario MX" },
      {
        property: "og:description",
        content: "Usuarios, roles, almacenes, categorías, unidades y empresa.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Configuración" description="Catálogos base y usuarios" />
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          title="Próxima etapa"
          description="Aquí se administrarán usuarios y roles, almacenes, categorías, unidades y datos de la empresa."
        />
      </div>
    </div>
  ),
});
