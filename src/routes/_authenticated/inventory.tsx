import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/table-states";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario — Coimbec" },
      { name: "description", content: "Existencias por almacén, kárdex y ajustes de inventario." },
      { property: "og:title", content: "Inventario — Coimbec" },
      {
        property: "og:description",
        content: "Existencias por almacén, kárdex y ajustes de inventario.",
      },
    ],
  }),
  component: () => (
    <div>
      <PageHeader title="Inventario" description="Existencias, kárdex y ajustes" />
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          title="Próxima etapa"
          description="Mientras tanto puedes consultar existencias y kárdex desde la ficha de cada producto."
        />
      </div>
    </div>
  ),
});
