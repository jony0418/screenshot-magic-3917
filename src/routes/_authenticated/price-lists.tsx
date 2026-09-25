import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Percent, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/table-states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csv";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/price-lists")({
  head: () => ({
    meta: [
      { title: "Listas de precios — Inventario MX" },
      {
        name: "description",
        content: "Administra listas de precios y aplica aumentos masivos por porcentaje.",
      },
      { property: "og:title", content: "Listas de precios — Inventario MX" },
      {
        property: "og:description",
        content: "Administra listas de precios y aplica aumentos masivos por porcentaje.",
      },
    ],
  }),
  component: PriceListsPage,
});

function PriceListsPage() {
  const queryClient = useQueryClient();
  const [activeList, setActiveList] = useState<string>("");
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [percent, setPercent] = useState("5");
  const [bulkCategory, setBulkCategory] = useState("all");

  const lists = useQuery({
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

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const listId = activeList || lists.data?.find((l) => l.is_default)?.id || lists.data?.[0]?.id || "";

  const prices = useQuery({
    queryKey: ["list-prices", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_prices")
        .select("id, price, products(sku, name, categories(name))")
        .eq("price_list_id", listId)
        .limit(500);
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (a.products?.name ?? "").localeCompare(b.products?.name ?? ""),
      );
    },
  });

  const createList = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("price_lists").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista creada");
      setNewListOpen(false);
      setNewListName("");
      void queryClient.invalidateQueries({ queryKey: ["price-lists"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("bulk_update_prices", {
        _price_list_id: listId,
        _percent: Number(percent),
        _category_id: bulkCategory === "all" ? undefined : bulkCategory,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Precios actualizados");
      setBulkOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["list-prices"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = prices.data ?? [];

  return (
    <div>
      <PageHeader
        title="Listas de precios"
        description="Precios sin IVA por lista y actualización masiva"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                exportToCsv(
                  "lista-precios",
                  rows.map((r) => ({
                    sku: r.products?.sku ?? "",
                    producto: r.products?.name ?? "",
                    categoria: r.products?.categories?.name ?? "",
                    precio: r.price,
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" disabled={!listId} onClick={() => setBulkOpen(true)}>
              <Percent className="mr-2 h-4 w-4" /> Actualización masiva
            </Button>
            <Button size="sm" onClick={() => setNewListOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva lista
            </Button>
          </>
        }
      />

      <div className="mb-3">
        <Select value={listId} onValueChange={setActiveList}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecciona una lista" />
          </SelectTrigger>
          <SelectContent>
            {(lists.data ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
                {l.is_default ? " (predeterminada)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {prices.isLoading ? (
          <LoadingState />
        ) : prices.error ? (
          <ErrorState error={prices.error} onRetry={() => void prices.refetch()} />
        ) : !rows.length ? (
          <EmptyState description="Esta lista aún no tiene precios." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="text-right">Precio sin IVA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{row.products?.sku}</td>
                    <td>{row.products?.name}</td>
                    <td>{row.products?.categories?.name ?? "—"}</td>
                    <td className="num text-right">{money(row.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva lista de precios</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="listName">Nombre</Label>
            <Input
              id="listName"
              value={newListName}
              maxLength={80}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Distribuidor"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewListOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!newListName.trim() || createList.isPending}
              onClick={() => createList.mutate(newListName.trim())}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Actualización masiva de precios</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="percent">Porcentaje (usa negativo para descuento)</Label>
              <Input
                id="percent"
                type="number"
                step="0.1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger>
                  <SelectValue />
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={bulkUpdate.isPending} onClick={() => bulkUpdate.mutate()}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
