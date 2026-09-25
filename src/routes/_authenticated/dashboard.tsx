import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Coins, ShoppingCart, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/table-states";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { money, qty } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tablero — Inventario MX" },
      {
        name: "description",
        content: "Valor del inventario, productos bajo mínimo y órdenes pendientes.",
      },
      { property: "og:title", content: "Tablero — Inventario MX" },
      {
        property: "og:description",
        content: "Valor del inventario, productos bajo mínimo y órdenes pendientes.",
      },
    ],
  }),
  component: DashboardPage,
});

type Summary = {
  inventory_value: number;
  low_stock_count: number;
  open_purchase_orders: number;
  open_sales_orders: number;
  sales_this_month: number;
};

function DashboardPage() {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary");
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const lowStock = useQuery({
    queryKey: ["low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("low_stock_products");
      if (error) throw error;
      return data ?? [];
    },
  });

  const cards = [
    {
      label: "Valor del inventario (costo)",
      value: money(summary.data?.inventory_value),
      icon: Coins,
    },
    {
      label: "Productos bajo mínimo",
      value: qty(summary.data?.low_stock_count),
      icon: AlertTriangle,
    },
    {
      label: "OC pendientes de recibir",
      value: qty(summary.data?.open_purchase_orders),
      icon: ClipboardList,
    },
    {
      label: "OV pendientes de surtir",
      value: qty(summary.data?.open_sales_orders),
      icon: ShoppingCart,
    },
    { label: "Ventas del mes", value: money(summary.data?.sales_this_month), icon: TrendingUp },
  ];

  return (
    <div>
      <PageHeader title="Tablero" description="Resumen operativo del almacén principal" />

      {summary.isLoading ? (
        <LoadingState />
      ) : summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <card.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="num mt-2 text-xl font-semibold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Productos bajo mínimo</h2>
          <Link to="/products" className="text-xs text-primary hover:underline">
            Ver productos
          </Link>
        </div>
        {lowStock.isLoading ? (
          <LoadingState />
        ) : lowStock.error ? (
          <ErrorState error={lowStock.error} onRetry={() => void lowStock.refetch()} />
        ) : !lowStock.data?.length ? (
          <EmptyState
            title="Todo en orden"
            description="Ningún producto está por debajo de su mínimo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th className="text-right">Existencia</th>
                  <th className="text-right">Mínimo</th>
                  <th className="text-right">Faltante</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.data.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{row.sku}</td>
                    <td>
                      <Link
                        to="/products/$productId"
                        params={{ productId: row.id }}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="num text-right">{qty(row.qty_on_hand)}</td>
                    <td className="num text-right">{qty(row.min_stock)}</td>
                    <td className="num text-right text-destructive">
                      {qty(Number(row.min_stock) - Number(row.qty_on_hand))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
