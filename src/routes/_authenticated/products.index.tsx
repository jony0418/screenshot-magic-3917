import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ProductFormDialog, type ProductFormValues } from "@/components/product-form-dialog";
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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csv";
import { money, qty } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({
    meta: [
      { title: "Productos — Inventario MX" },
      { name: "description", content: "Catálogo de productos con SKU, código de barras y precios." },
      { property: "og:title", content: "Productos — Inventario MX" },
      {
        property: "og:description",
        content: "Catálogo de productos con SKU, código de barras y precios.",
      },
    ],
  }),
  component: ProductsPage,
});

const PAGE_SIZE = 25;

function ProductsPage() {
  const { hasAnyRole, isAdmin } = useAuth();
  const canSeeCosts = hasAnyRole(["admin", "compras", "almacen"]);
  const canEdit = isAdmin || hasAnyRole(["compras"]);
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ["products", term, category, status, page],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(
          "id, sku, barcode, name, brand, min_stock, max_stock, avg_cost, last_cost, is_active, categories(name), units(code)",
          { count: "exact" },
        )
        .order("name")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (term.trim()) {
        const like = `%${term.trim()}%`;
        query = query.or(`name.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`);
      }
      if (category !== "all") query = query.eq("category_id", category);
      if (status !== "all") query = query.eq("is_active", status === "active");

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const createProduct = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const { error } = await supabase.from("products").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto creado");
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totalPages = Math.max(1, Math.ceil((products.data?.count ?? 0) / PAGE_SIZE));
  const rows = useMemo(() => products.data?.rows ?? [], [products.data]);

  function handleExport() {
    exportToCsv(
      "productos",
      rows.map((row) => ({
        sku: row.sku,
        codigo_barras: row.barcode ?? "",
        nombre: row.name,
        categoria: row.categories?.name ?? "",
        unidad: row.units?.code ?? "",
        marca: row.brand ?? "",
        minimo: row.min_stock,
        maximo: row.max_stock,
        ...(canSeeCosts ? { costo_promedio: row.avg_cost, ultimo_costo: row.last_cost } : {}),
        estado: row.is_active ? "Activo" : "Inactivo",
      })),
    );
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        description="Catálogo general del inventario"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            {canEdit ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo producto
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar por SKU, nombre o código de barras"
          className="max-w-xs"
          maxLength={80}
        />
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {products.isLoading ? (
          <LoadingState />
        ) : products.error ? (
          <ErrorState error={products.error} onRetry={() => void products.refetch()} />
        ) : !rows.length ? (
          <EmptyState description="Ajusta los filtros o registra un producto nuevo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Unidad</th>
                  <th className="text-right">Mín.</th>
                  {canSeeCosts ? <th className="text-right">Costo prom.</th> : null}
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{row.sku}</td>
                    <td>
                      <Link
                        to="/products/$productId"
                        params={{ productId: row.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.brand ? (
                        <span className="ml-2 text-xs text-muted-foreground">{row.brand}</span>
                      ) : null}
                    </td>
                    <td>{row.categories?.name ?? "—"}</td>
                    <td>{row.units?.code ?? "—"}</td>
                    <td className="num text-right">{qty(row.min_stock)}</td>
                    {canSeeCosts ? <td className="num text-right">{money(row.avg_cost)}</td> : null}
                    <td>
                      <span
                        className={
                          row.is_active ? "text-success" : "text-muted-foreground line-through"
                        }
                      >
                        {row.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>{products.data?.count ?? 0} productos</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(values) => createProduct.mutate(values)}
        submitting={createProduct.isPending}
      />
    </div>
  );
}
