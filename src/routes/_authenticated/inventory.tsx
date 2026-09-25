import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { selectClass } from "@/components/order-lines-editor";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/table-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csv";
import { dateTimeMX, money, MOVEMENT_LABEL, qty } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario — Coimbec" },
      { name: "description", content: "Existencias por almacén, kárdex de movimientos y ajustes de inventario." },
      { property: "og:title", content: "Inventario — Coimbec" },
      { property: "og:description", content: "Existencias por almacén, kárdex de movimientos y ajustes de inventario." },
    ],
  }),
  component: InventoryPage,
});

function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });
}

function useProductsMin() {
  return useQuery({
    queryKey: ["products-public-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products_public").select("id, sku, name, min_stock").order("sku");
      if (error) throw error;
      return data;
    },
  });
}

function InventoryPage() {
  const { hasAnyRole } = useAuth();
  const canKardex = hasAnyRole(["admin", "compras", "almacen"]);
  const canAdjust = hasAnyRole(["admin", "almacen"]);
  const [tab, setTab] = useState("stock");

  return (
    <div>
      <PageHeader title="Inventario" description="Existencias, kárdex y ajustes" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="stock">Existencias</TabsTrigger>
          {canKardex ? <TabsTrigger value="kardex">Kárdex</TabsTrigger> : null}
          {canAdjust ? <TabsTrigger value="adjust">Ajuste</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="stock">
          <StockTab />
        </TabsContent>
        {canKardex ? (
          <TabsContent value="kardex">
            <KardexTab />
          </TabsContent>
        ) : null}
        {canAdjust ? (
          <TabsContent value="adjust">
            <AdjustTab onDone={() => setTab("kardex")} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function StockTab() {
  const { hasAnyRole } = useAuth();
  const canSeeCosts = hasAnyRole(["admin", "compras", "almacen"]);
  const warehouses = useWarehouses();
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) {
      setWarehouseId((warehouses.data.find((w) => w.is_default) ?? warehouses.data[0]).id);
    }
  }, [warehouses.data, warehouseId]);

  const stock = useQuery({
    enabled: !!warehouseId,
    queryKey: ["stock", warehouseId, canSeeCosts],
    queryFn: async () => {
      const { data: levels, error } = await supabase
        .from("stock_levels")
        .select("product_id, qty_on_hand, qty_reserved")
        .eq("warehouse_id", warehouseId);
      if (error) throw error;
      const { data: prods, error: e2 } = canSeeCosts
        ? await supabase.from("products").select("id, sku, name, min_stock, avg_cost").order("sku")
        : await supabase.from("products_public").select("id, sku, name, min_stock").order("sku");
      if (e2) throw e2;
      const map = new Map(levels.map((l) => [l.product_id, l]));
      return (prods ?? []).map((p) => {
        const l = map.get(p.id ?? "");
        const onHand = Number(l?.qty_on_hand ?? 0);
        const reserved = Number(l?.qty_reserved ?? 0);
        const cost = "avg_cost" in p ? Number(p.avg_cost) : 0;
        return {
          id: p.id ?? "",
          sku: p.sku ?? "",
          name: p.name ?? "",
          min: Number(p.min_stock ?? 0),
          onHand,
          reserved,
          available: onHand - reserved,
          cost,
          value: onHand * cost,
        };
      });
    },
  });

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (stock.data ?? []).filter(
      (r) =>
        (!t || r.sku.toLowerCase().includes(t) || r.name.toLowerCase().includes(t)) &&
        (!onlyLow || r.onHand < r.min),
    );
  }, [stock.data, search, onlyLow]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={selectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          {(warehouses.data ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
        <Input className="w-64" placeholder="Buscar SKU o nombre" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Solo bajo mínimo
        </label>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            exportToCsv(
              "existencias.csv",
              rows.map((r) => ({
                SKU: r.sku,
                Producto: r.name,
                Existencia: r.onHand,
                Reservado: r.reserved,
                Disponible: r.available,
                Minimo: r.min,
                ...(canSeeCosts ? { CostoPromedio: r.cost, Valor: r.value } : {}),
              })),
            )
          }
        >
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {stock.isLoading ? (
          <LoadingState />
        ) : stock.error ? (
          <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th className="text-right">Existencia</th>
                  <th className="text-right">Reservado</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">Mínimo</th>
                  {canSeeCosts ? <th className="text-right">Costo prom.</th> : null}
                  {canSeeCosts ? <th className="text-right">Valor</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.sku}</td>
                    <td>{r.name}</td>
                    <td className={`num text-right ${r.onHand < r.min ? "font-semibold text-destructive" : ""}`}>
                      {qty(r.onHand)}
                    </td>
                    <td className="num text-right">{qty(r.reserved)}</td>
                    <td className="num text-right">{qty(r.available)}</td>
                    <td className="num text-right">{qty(r.min)}</td>
                    {canSeeCosts ? <td className="num text-right">{money(r.cost)}</td> : null}
                    {canSeeCosts ? <td className="num text-right">{money(r.value)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canSeeCosts ? (
          <div className="border-t border-border px-3 py-2 text-right text-sm">
            Valor del inventario mostrado: <span className="num font-semibold">{money(totalValue)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KardexTab() {
  const products = useProductsMin();
  const warehouses = useWarehouses();
  const [productId, setProductId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const moves = useQuery({
    queryKey: ["kardex", productId, warehouseId, from, to],
    queryFn: async () => {
      let q = supabase
        .from("inventory_movements")
        .select("*, products(sku, name), warehouses(code)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (productId !== "all") q = q.eq("product_id", productId);
      if (warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
      if (from) q = q.gte("created_at", `${from}T00:00:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const rows = moves.data ?? [];

  return (
    <div className="mt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="all">Todos los productos</option>
          {(products.data ?? []).map((p) => (
            <option key={p.id} value={p.id ?? ""}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
        <select className={selectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="all">Todos los almacenes</option>
          {(warehouses.data ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.code}
            </option>
          ))}
        </select>
        <Label className="text-xs text-muted-foreground">Del</Label>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Label className="text-xs text-muted-foreground">al</Label>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            exportToCsv(
              "kardex.csv",
              rows.map((m) => ({
                Fecha: m.created_at,
                SKU: m.products?.sku,
                Producto: m.products?.name,
                Almacen: m.warehouses?.code,
                Tipo: MOVEMENT_LABEL[m.movement_type],
                Cantidad: m.qty,
                CostoUnitario: m.unit_cost,
                Saldo: m.balance_after,
                Notas: m.notes ?? "",
              })),
            )
          }
        >
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {moves.isLoading ? (
          <LoadingState />
        ) : moves.error ? (
          <ErrorState error={moves.error} onRetry={() => moves.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="Sin movimientos" description="Ajusta los filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Almacén</th>
                  <th>Tipo</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Costo unit.</th>
                  <th className="text-right">Saldo</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{dateTimeMX(m.created_at)}</td>
                    <td>
                      <span className="num text-xs text-muted-foreground">{m.products?.sku}</span> {m.products?.name}
                    </td>
                    <td>{m.warehouses?.code}</td>
                    <td>{MOVEMENT_LABEL[m.movement_type]}</td>
                    <td className={`num text-right ${Number(m.qty) < 0 ? "text-destructive" : "text-success"}`}>
                      {Number(m.qty) > 0 ? "+" : ""}
                      {qty(m.qty)}
                    </td>
                    <td className="num text-right">{money(m.unit_cost)}</td>
                    <td className="num text-right">{qty(m.balance_after)}</td>
                    <td className="max-w-[240px] truncate text-muted-foreground">{m.notes}</td>
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

function AdjustTab({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const products = useProductsMin();
  const warehouses = useWarehouses();
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) {
      setWarehouseId((warehouses.data.find((w) => w.is_default) ?? warehouses.data[0]).id);
    }
  }, [warehouses.data, warehouseId]);

  const current = useQuery({
    enabled: !!productId && !!warehouseId,
    queryKey: ["stock-one", productId, warehouseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_levels")
        .select("qty_on_hand, qty_reserved")
        .eq("product_id", productId)
        .eq("warehouse_id", warehouseId)
        .maybeSingle();
      return data;
    },
  });

  const adjust = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Selecciona un producto");
      const n = Number(amount);
      if (!n || n <= 0) throw new Error("Captura una cantidad mayor a cero");
      if (!reason.trim()) throw new Error("El motivo es obligatorio");
      const { error } = await supabase.rpc("adjust_inventory", {
        _product_id: productId,
        _warehouse_id: warehouseId,
        _qty: direction === "in" ? n : -n,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajuste registrado en el kárdex");
      setAmount("");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["stock"] });
      void qc.invalidateQueries({ queryKey: ["stock-one"] });
      void qc.invalidateQueries({ queryKey: ["kardex"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="mt-3 max-w-xl space-y-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        adjust.mutate();
      }}
    >
      <div>
        <Label>Producto</Label>
        <select className={`${selectClass} mt-1 w-full`} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Selecciona…</option>
          {(products.data ?? []).map((p) => (
            <option key={p.id} value={p.id ?? ""}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Almacén</Label>
          <select className={`${selectClass} mt-1 w-full`} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Tipo</Label>
          <select
            className={`${selectClass} mt-1 w-full`}
            value={direction}
            onChange={(e) => setDirection(e.target.value as "in" | "out")}
          >
            <option value="in">Entrada (+)</option>
            <option value="out">Salida (−)</option>
          </select>
        </div>
        <div>
          <Label>Cantidad</Label>
          <Input type="number" min="0" step="any" className="mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      {productId ? (
        <p className="text-xs text-muted-foreground">
          Existencia actual: <span className="num">{qty(current.data?.qty_on_hand ?? 0)}</span> · reservado{" "}
          <span className="num">{qty(current.data?.qty_reserved ?? 0)}</span>
        </p>
      ) : null}
      <div>
        <Label>Motivo (obligatorio)</Label>
        <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conteo físico, merma, daño…" />
      </div>
      <Button type="submit" disabled={adjust.isPending}>
        {adjust.isPending ? "Registrando…" : "Registrar ajuste"}
      </Button>
    </form>
  );
}
