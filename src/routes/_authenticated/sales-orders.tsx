import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, Plus, Printer, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  computeTotals,
  newLine,
  OrderLinesEditor,
  selectClass,
  type EditorLine,
} from "@/components/order-lines-editor";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csv";
import { dateMX, money, qty, SO_STATUS_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales-orders")({
  head: () => ({
    meta: [
      { title: "Órdenes de venta — Coimbec" },
      { name: "description", content: "Órdenes de venta, reservas de existencia y surtido a clientes." },
      { property: "og:title", content: "Órdenes de venta — Coimbec" },
      { property: "og:description", content: "Órdenes de venta, reservas de existencia y surtido a clientes." },
    ],
  }),
  component: SalesOrdersPage,
});

const PAGE_SIZE = 25;

function useCatalogs() {
  const customers = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, code, business_name, price_list_id")
        .eq("is_active", true)
        .order("business_name");
      if (error) throw error;
      return data;
    },
  });
  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });
  const products = useQuery({
    queryKey: ["products-public-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_public")
        .select("id, sku, name, tax_rate")
        .eq("is_active", true)
        .order("sku");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id ?? "",
        sku: p.sku ?? "",
        name: p.name ?? "",
        tax_rate: Number(p.tax_rate ?? 0.16),
      }));
    },
  });
  const priceLists = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_lists").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  return { customers, warehouses, products, priceLists };
}

function SalesOrdersPage() {
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "ventas"]);
  const canShip = hasAnyRole(["admin", "almacen"]);
  const { customers } = useCatalogs();

  const [status, setStatus] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => setPage(0), [status, customer, from, to]);

  const list = useQuery({
    queryKey: ["sales-orders", status, customer, from, to, page],
    queryFn: async () => {
      let q = supabase
        .from("sales_orders")
        .select("id, folio, order_date, status, subtotal, tax, total, customers(business_name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") q = q.eq("status", status as "draft");
      if (customer !== "all") q = q.eq("customer_id", customer);
      if (from) q = q.gte("order_date", from);
      if (to) q = q.lte("order_date", to);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  const rows = list.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Órdenes de venta"
        description="Captura, confirmación con reserva y surtido"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToCsv(
                  "ordenes-venta.csv",
                  rows.map((r) => ({
                    Folio: r.folio,
                    Cliente: r.customers?.business_name ?? "",
                    Fecha: r.order_date,
                    Estado: SO_STATUS_LABEL[r.status],
                    Subtotal: r.subtotal,
                    IVA: r.tax,
                    Total: r.total,
                  })),
                )
              }
            >
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
            {canWrite ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="mr-1 h-4 w-4" /> Nueva orden
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos los estados</option>
          {Object.entries(SO_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={selectClass} value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="all">Todos los clientes</option>
          {(customers.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.business_name}
            </option>
          ))}
        </select>
        <Label className="text-xs text-muted-foreground">Del</Label>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Label className="text-xs text-muted-foreground">al</Label>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        {list.isLoading ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="Sin órdenes de venta" description="Crea una orden para comenzar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setViewing(r.id)}>
                    <td className="num font-medium">{r.folio}</td>
                    <td>{r.customers?.business_name}</td>
                    <td>{dateMX(r.order_date)}</td>
                    <td>
                      <StatusBadge kind="so" status={r.status} />
                    </td>
                    <td className="num text-right">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            {list.data?.count ?? 0} órdenes · página {page + 1} de {pages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {editing ? (
        <SalesOrderEditor
          orderId={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setViewing(id);
          }}
        />
      ) : null}

      <SalesOrderDetail
        orderId={viewing}
        onClose={() => setViewing(null)}
        canWrite={canWrite}
        canShip={canShip}
        onEdit={(id) => {
          setViewing(null);
          setEditing(id);
        }}
      />
    </div>
  );
}

function useAvailability(warehouseId: string) {
  return useQuery({
    enabled: !!warehouseId,
    queryKey: ["availability", warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_levels")
        .select("product_id, qty_on_hand, qty_reserved")
        .eq("warehouse_id", warehouseId);
      if (error) throw error;
      return Object.fromEntries(
        data.map((s) => [s.product_id, Number(s.qty_on_hand) - Number(s.qty_reserved)]),
      ) as Record<string, number>;
    },
  });
}

function SalesOrderEditor({
  orderId,
  onClose,
  onSaved,
}: {
  orderId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canEditPrice = hasAnyRole(["admin", "ventas"]);
  const { customers, warehouses, products, priceLists } = useCatalogs();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [loaded, setLoaded] = useState(orderId === null);

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) {
      setWarehouseId((warehouses.data.find((w) => w.is_default) ?? warehouses.data[0]).id);
    }
  }, [warehouses.data, warehouseId]);

  useEffect(() => {
    if (!orderId) return;
    void (async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*, sales_order_lines(*)")
        .eq("id", orderId)
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setCustomerId(data.customer_id);
      setWarehouseId(data.warehouse_id);
      setOrderDate(data.order_date);
      setNotes(data.notes ?? "");
      setLines(
        data.sales_order_lines.map((l) => ({
          key: l.id,
          product_id: l.product_id,
          qty: String(l.qty_ordered),
          price: String(l.unit_price),
          discount: String(l.discount_pct),
        })),
      );
      setLoaded(true);
    })();
  }, [orderId]);

  const cust = customers.data?.find((c) => c.id === customerId);
  const listId =
    cust?.price_list_id ?? priceLists.data?.find((l) => l.is_default)?.id ?? priceLists.data?.[0]?.id ?? "";
  const listName = priceLists.data?.find((l) => l.id === listId)?.name;

  const prices = useQuery({
    enabled: !!listId,
    queryKey: ["list-prices", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("price_list_id", listId);
      if (error) throw error;
      return Object.fromEntries(data.map((p) => [p.product_id, Number(p.price)])) as Record<string, number>;
    },
  });

  const availability = useAvailability(warehouseId);

  // When the customer changes on a new order, refresh line prices from the new list.
  useEffect(() => {
    if (orderId || !prices.data) return;
    setLines((prev) =>
      prev.map((l) => (l.product_id && prices.data![l.product_id] !== undefined ? { ...l, price: String(prices.data![l.product_id]) } : l)),
    );
  }, [prices.data, orderId]);

  const prodList = useMemo(() => products.data ?? [], [products.data]);

  const save = useMutation({
    mutationFn: async () => {
      const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0);
      if (!customerId) throw new Error("Selecciona un cliente");
      if (!warehouseId) throw new Error("Selecciona un almacén");
      if (valid.length === 0) throw new Error("Agrega al menos una línea con producto y cantidad");
      const header = {
        customer_id: customerId,
        warehouse_id: warehouseId,
        order_date: orderDate,
        notes: notes || null,
      };
      let id = orderId;
      if (id) {
        const { error } = await supabase.from("sales_orders").update(header).eq("id", id);
        if (error) throw error;
        const del = await supabase.from("sales_order_lines").delete().eq("sales_order_id", id);
        if (del.error) throw del.error;
      } else {
        const { data, error } = await supabase
          .from("sales_orders")
          .insert({ ...header, folio: "" })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      const { error } = await supabase.from("sales_order_lines").insert(
        valid.map((l) => ({
          sales_order_id: id!,
          product_id: l.product_id,
          qty_ordered: Number(l.qty),
          unit_price: Number(l.price),
          discount_pct: Number(l.discount || 0),
        })),
      );
      if (error) throw error;
      return id!;
    },
    onSuccess: (id) => {
      toast.success("Orden de venta guardada");
      void qc.invalidateQueries({ queryKey: ["sales-orders"] });
      void qc.invalidateQueries({ queryKey: ["sales-order", id] });
      onSaved(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = computeTotals(lines, prodList);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{orderId ? "Editar orden de venta" : "Nueva orden de venta"}</DialogTitle>
        </DialogHeader>
        {!loaded ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Label>Cliente</Label>
                <select
                  autoFocus
                  className={`${selectClass} mt-1 w-full`}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {(customers.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.business_name}
                    </option>
                  ))}
                </select>
                {listName ? (
                  <p className="mt-1 text-xs text-muted-foreground">Lista de precios: {listName}</p>
                ) : null}
              </div>
              <div>
                <Label>Almacén</Label>
                <select
                  className={`${selectClass} mt-1 w-full`}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" className="mt-1" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="sm:col-span-4">
                <Label>Notas</Label>
                <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <OrderLinesEditor
              lines={lines}
              onChange={setLines}
              products={prodList}
              priceLabel="Precio (sin IVA)"
              canEditPrice={canEditPrice}
              showDiscount
              available={availability.data ?? {}}
              defaultPrice={(pid) => prices.data?.[pid]}
            />
          </div>
        )}
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            Total {money(totals.total)} · las cantidades en rojo exceden lo disponible
          </span>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !loaded}>
            {save.isPending ? "Guardando…" : "Guardar borrador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalesOrderDetail({
  orderId,
  onClose,
  canWrite,
  canShip,
  onEdit,
}: {
  orderId: string | null;
  onClose: () => void;
  canWrite: boolean;
  canShip: boolean;
  onEdit: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [shipping, setShipping] = useState(false);

  const detail = useQuery({
    enabled: !!orderId,
    queryKey: ["sales-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          "*, customers(business_name), warehouses(code, name), sales_order_lines(*, products(sku, name)), shipments(id, folio, shipment_date)",
        )
        .eq("id", orderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["sales-orders"] });
    void qc.invalidateQueries({ queryKey: ["sales-order", orderId] });
    void qc.invalidateQueries({ queryKey: ["availability"] });
  };

  const confirm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("confirm_sales_order", { _sales_order_id: orderId! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden confirmada; existencia reservada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const reason = window.prompt("Motivo de la cancelación");
      if (reason === null) throw new Error("__skip");
      const { error } = await supabase.rpc("cancel_sales_order", { _sales_order_id: orderId!, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden cancelada; reservas liberadas");
      refresh();
    },
    onError: (e: Error) => e.message !== "__skip" && toast.error(e.message),
  });

  const o = detail.data;

  return (
    <Sheet open={!!orderId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{o ? `Orden de venta ${o.folio}` : "Orden de venta"}</SheetTitle>
        </SheetHeader>
        {detail.isLoading ? (
          <LoadingState />
        ) : detail.error ? (
          <ErrorState error={detail.error} />
        ) : o ? (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="so" status={o.status} />
              <span className="text-muted-foreground">
                {o.customers?.business_name} · {o.warehouses?.code} · {dateMX(o.order_date)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite && o.status === "draft" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onEdit(o.id)}>
                    Editar
                  </Button>
                  <Button size="sm" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar
                  </Button>
                </>
              ) : null}
              {canShip && ["confirmed", "partial"].includes(o.status) ? (
                <Button size="sm" onClick={() => setShipping(true)}>
                  <Truck className="mr-1 h-4 w-4" /> Surtir
                </Button>
              ) : null}
              <Button size="sm" variant="outline" asChild>
                <Link to="/print/$kind/$orderId" params={{ kind: "so", orderId: o.id }}>
                  <Printer className="mr-1 h-4 w-4" /> Imprimir
                </Link>
              </Button>
              {canWrite && ["draft", "confirmed", "partial"].includes(o.status) ? (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => cancel.mutate()}>
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
              ) : null}
            </div>
            <table className="data-table w-full rounded border border-border">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Pedido</th>
                  <th className="text-right">Surtido</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Desc.</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {o.sales_order_lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="num text-xs text-muted-foreground">{l.products?.sku}</span> {l.products?.name}
                    </td>
                    <td className="num text-right">{qty(l.qty_ordered)}</td>
                    <td className="num text-right">{qty(l.qty_shipped)}</td>
                    <td className="num text-right">{money(l.unit_price)}</td>
                    <td className="num text-right">{qty(l.discount_pct)}%</td>
                    <td className="num text-right">{money(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto grid w-56 grid-cols-2 gap-y-0.5">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="num text-right">{money(o.subtotal)}</dd>
              <dt className="text-muted-foreground">IVA</dt>
              <dd className="num text-right">{money(o.tax)}</dd>
              <dt className="font-semibold">Total</dt>
              <dd className="num text-right font-semibold">{money(o.total)}</dd>
            </dl>
            {o.notes ? <p className="text-muted-foreground">Notas: {o.notes}</p> : null}
            {o.shipments.length ? (
              <div>
                <p className="mb-1 font-medium">Surtidos</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {o.shipments.map((s) => (
                    <li key={s.id} className="num">
                      {s.folio} · {dateMX(s.shipment_date)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {shipping && o ? (
          <ShipDialog
            order={o}
            onClose={() => setShipping(false)}
            onDone={() => {
              setShipping(false);
              refresh();
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ShipDialog({
  order,
  onClose,
  onDone,
}: {
  order: {
    id: string;
    folio: string;
    sales_order_lines: {
      id: string;
      qty_ordered: number;
      qty_shipped: number;
      products: { sku: string; name: string } | null;
    }[];
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const pending = order.sales_order_lines.filter((l) => Number(l.qty_ordered) - Number(l.qty_shipped) > 0);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pending.map((l) => [l.id, String(Number(l.qty_ordered) - Number(l.qty_shipped))])),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const ship = useMutation({
    mutationFn: async () => {
      const lines = pending
        .map((l) => ({ sales_order_line_id: l.id, qty: Number(values[l.id] || 0) }))
        .filter((l) => l.qty > 0);
      if (!lines.length) throw new Error("Captura al menos una cantidad a surtir");
      const { error } = await supabase.rpc("ship_sales_order", {
        _sales_order_id: order.id,
        _lines: lines,
        _shipment_date: date,
        _notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Surtido registrado; existencias descontadas");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Surtir — {order.folio}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Fecha de salida</Label>
            <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Pendiente</th>
              <th className="w-28 text-right">Surtir</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="num text-xs text-muted-foreground">{l.products?.sku}</span> {l.products?.name}
                </td>
                <td className="num text-right">{qty(Number(l.qty_ordered) - Number(l.qty_shipped))}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={`${selectClass} num w-full text-right`}
                    value={values[l.id] ?? ""}
                    onChange={(e) => setValues({ ...values, [l.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => ship.mutate()} disabled={ship.isPending}>
            {ship.isPending ? "Registrando…" : "Registrar salida"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
