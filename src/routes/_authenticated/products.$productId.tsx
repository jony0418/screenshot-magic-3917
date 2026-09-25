import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ProductFormDialog, type ProductFormValues } from "@/components/product-form-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/table-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { dateTimeMX, money, MOVEMENT_LABEL, qty } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products/$productId")({
  head: () => ({
    meta: [
      { title: "Ficha de producto — Inventario MX" },
      {
        name: "description",
        content: "Detalle del producto: precios por lista, existencias y kárdex de movimientos.",
      },
      { property: "og:title", content: "Ficha de producto — Inventario MX" },
      {
        property: "og:description",
        content: "Detalle del producto: precios por lista, existencias y kárdex.",
      },
    ],
  }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { hasAnyRole, isAdmin } = useAuth();
  const canSeeCosts = hasAnyRole(["admin", "compras", "almacen"]);
  const canEditPrices = hasAnyRole(["admin", "ventas"]);
  const canEdit = isAdmin || hasAnyRole(["compras"]);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const product = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), units(code, name)")
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const prices = useQuery({
    queryKey: ["product-prices", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_prices")
        .select("id, price, price_list_id, price_lists(name, is_default)")
        .eq("product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const history = useQuery({
    queryKey: ["price-history", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("id, old_price, new_price, changed_at, price_lists(name)")
        .eq("product_id", productId)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stock = useQuery({
    queryKey: ["product-stock", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_levels")
        .select("id, qty_on_hand, qty_reserved, warehouses(code, name)")
        .eq("product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const kardex = useQuery({
    queryKey: ["product-kardex", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select(
          "id, movement_type, qty, unit_cost, balance_after, notes, created_at, warehouses(code)",
        )
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateProduct = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const { error } = await supabase.from("products").update(values).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto actualizado");
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["product", productId] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePrice = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      const { error } = await supabase.from("product_prices").update({ price }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Precio actualizado");
      void queryClient.invalidateQueries({ queryKey: ["product-prices", productId] });
      void queryClient.invalidateQueries({ queryKey: ["price-history", productId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (product.isLoading) return <LoadingState />;
  if (product.error)
    return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
  if (!product.data)
    return <EmptyState title="Producto no encontrado" description="Puede haber sido eliminado." />;

  const p = product.data;

  return (
    <div>
      <Link
        to="/products"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a productos
      </Link>
      <PageHeader
        title={p.name}
        description={`SKU ${p.sku}${p.brand ? ` · ${p.brand}` : ""}`}
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="prices">Precios</TabsTrigger>
          <TabsTrigger value="stock">Existencias</TabsTrigger>
          <TabsTrigger value="kardex">Kárdex</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <dl className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
            <Field label="Código de barras" value={p.barcode ?? "—"} mono />
            <Field label="Categoría" value={p.categories?.name ?? "—"} />
            <Field label="Unidad" value={p.units ? `${p.units.code} — ${p.units.name}` : "—"} />
            <Field label="Mínimo" value={qty(p.min_stock)} mono />
            <Field label="Máximo" value={qty(p.max_stock)} mono />
            <Field label="IVA" value={`${Math.round(Number(p.tax_rate) * 100)}%`} mono />
            {canSeeCosts ? <Field label="Costo promedio" value={money(p.avg_cost)} mono /> : null}
            {canSeeCosts ? <Field label="Último costo" value={money(p.last_cost)} mono /> : null}
            <Field label="Estado" value={p.is_active ? "Activo" : "Inactivo"} />
            <div className="sm:col-span-3">
              <Field label="Descripción" value={p.description ?? "—"} />
            </div>
          </dl>
        </TabsContent>

        <TabsContent value="prices">
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Precios por lista (sin IVA)
            </div>
            {prices.isLoading ? (
              <LoadingState />
            ) : !prices.data?.length ? (
              <EmptyState description="Este producto no tiene precios asignados." />
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Lista</th>
                    <th className="w-48 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.data.map((row) => (
                    <PriceRow
                      key={row.id}
                      id={row.id}
                      name={row.price_lists?.name ?? "Lista"}
                      price={Number(row.price)}
                      editable={canEditPrices}
                      onSave={(price) => savePrice.mutate({ id: row.id, price })}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Historial de precios
            </div>
            {history.isLoading ? (
              <LoadingState />
            ) : !history.data?.length ? (
              <EmptyState description="Sin cambios de precio registrados." />
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Lista</th>
                    <th className="text-right">Anterior</th>
                    <th className="text-right">Nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((row) => (
                    <tr key={row.id}>
                      <td className="num">{dateTimeMX(row.changed_at)}</td>
                      <td>{row.price_lists?.name ?? "—"}</td>
                      <td className="num text-right">
                        {row.old_price == null ? "—" : money(row.old_price)}
                      </td>
                      <td className="num text-right">{money(row.new_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stock">
          <div className="rounded-lg border border-border bg-card">
            {stock.isLoading ? (
              <LoadingState />
            ) : !stock.data?.length ? (
              <EmptyState description="Sin existencias registradas en ningún almacén." />
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Almacén</th>
                    <th className="text-right">Existencia</th>
                    <th className="text-right">Reservado</th>
                    <th className="text-right">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.warehouses?.code} — {row.warehouses?.name}
                      </td>
                      <td className="num text-right">{qty(row.qty_on_hand)}</td>
                      <td className="num text-right">{qty(row.qty_reserved)}</td>
                      <td className="num text-right font-medium">
                        {qty(Number(row.qty_on_hand) - Number(row.qty_reserved))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kardex">
          <div className="rounded-lg border border-border bg-card">
            {kardex.isLoading ? (
              <LoadingState />
            ) : !kardex.data?.length ? (
              <EmptyState description="Sin movimientos de inventario." />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Almacén</th>
                      <th>Movimiento</th>
                      <th className="text-right">Cantidad</th>
                      {canSeeCosts ? <th className="text-right">Costo unit.</th> : null}
                      <th className="text-right">Saldo</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex.data.map((row) => (
                      <tr key={row.id}>
                        <td className="num">{dateTimeMX(row.created_at)}</td>
                        <td>{row.warehouses?.code ?? "—"}</td>
                        <td>{MOVEMENT_LABEL[row.movement_type] ?? row.movement_type}</td>
                        <td
                          className={`num text-right ${Number(row.qty) < 0 ? "text-destructive" : "text-success"}`}
                        >
                          {qty(row.qty)}
                        </td>
                        {canSeeCosts ? (
                          <td className="num text-right">{money(row.unit_cost)}</td>
                        ) : null}
                        <td className="num text-right">{qty(row.balance_after)}</td>
                        <td className="max-w-[16rem] truncate text-muted-foreground">
                          {row.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ProductFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar producto"
        submitting={updateProduct.isPending}
        onSubmit={(values) => updateProduct.mutate(values)}
        defaultValues={{
          sku: p.sku,
          name: p.name,
          barcode: p.barcode ?? "",
          brand: p.brand ?? "",
          description: p.description ?? "",
          category_id: p.category_id ?? "",
          unit_id: p.unit_id ?? "",
          min_stock: Number(p.min_stock),
          max_stock: Number(p.max_stock),
          tax_rate: Number(p.tax_rate),
          is_active: p.is_active,
          notes: p.notes ?? "",
        }}
      />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "num" : ""}`}>{value}</dd>
    </div>
  );
}

function PriceRow({
  name,
  price,
  editable,
  onSave,
}: {
  id: string;
  name: string;
  price: number;
  editable: boolean;
  onSave: (price: number) => void;
}) {
  const [value, setValue] = useState(String(price));
  const dirty = Number(value) !== price && value !== "";

  return (
    <tr>
      <td>{name}</td>
      <td className="text-right">
        {editable ? (
          <div className="flex items-center justify-end gap-2">
            <Input
              value={value}
              type="number"
              step="0.01"
              min={0}
              onChange={(e) => setValue(e.target.value)}
              className="num h-8 w-28 text-right"
            />
            <Button size="sm" disabled={!dirty} onClick={() => onSave(Number(value))}>
              Guardar
            </Button>
          </div>
        ) : (
          <span className="num">{money(price)}</span>
        )}
      </td>
    </tr>
  );
}
