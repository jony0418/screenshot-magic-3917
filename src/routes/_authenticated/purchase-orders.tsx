import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, PackageCheck, Plus, Printer, Send, X } from "lucide-react";
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
import { dateMX, money, PO_STATUS_LABEL, qty } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  head: () => ({
    meta: [
      { title: "Órdenes de compra — Coimbec" },
      { name: "description", content: "Órdenes de compra, recepciones y costos por proveedor." },
      { property: "og:title", content: "Órdenes de compra — Coimbec" },
      { property: "og:description", content: "Órdenes de compra, recepciones y costos por proveedor." },
    ],
  }),
  component: PurchaseOrdersPage,
});

const PAGE_SIZE = 25;

function useCatalogs() {
  const suppliers = useQuery({
    queryKey: ["suppliers-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, code, business_name")
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
    queryKey: ["products-min-cost"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, tax_rate, last_cost")
        .eq("is_active", true)
        .order("sku");
      if (error) throw error;
      return data;
    },
  });
  return { suppliers, warehouses, products };
}

function PurchaseOrdersPage() {
  const { hasAnyRole } = useAuth();
  const canWrite = hasAnyRole(["admin", "compras"]);
  const canReceive = hasAnyRole(["admin", "compras", "almacen"]);
  const { suppliers } = useCatalogs();

  const [status, setStatus] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => setPage(0), [status, supplier, from, to]);

  const list = useQuery({
    queryKey: ["purchase-orders", status, supplier, from, to, page],
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("id, folio, order_date, expected_date, status, subtotal, tax, total, suppliers(business_name)", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") q = q.eq("status", status as "draft");
      if (supplier !== "all") q = q.eq("supplier_id", supplier);
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
        title="Órdenes de compra"
        description="Compras a proveedores y recepción de mercancía"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToCsv(
                  "ordenes-compra.csv",
                  rows.map((r) => ({
                    Folio: r.folio,
                    Proveedor: r.suppliers?.business_name ?? "",
                    Fecha: r.order_date,
                    Entrega: r.expected_date ?? "",
                    Estado: PO_STATUS_LABEL[r.status],
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
          {Object.entries(PO_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={selectClass} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="all">Todos los proveedores</option>
          {(suppliers.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.business_name}
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
          <EmptyState title="Sin órdenes de compra" description="Crea una orden para comenzar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Proveedor</th>
                  <th>Fecha</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setViewing(r.id)}>
                    <td className="num font-medium">{r.folio}</td>
                    <td>{r.suppliers?.business_name}</td>
                    <td>{dateMX(r.order_date)}</td>
                    <td>{dateMX(r.expected_date)}</td>
                    <td>
                      <StatusBadge kind="po" status={r.status} />
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
        <PurchaseOrderEditor
          orderId={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setViewing(id);
          }}
        />
      ) : null}

      <PurchaseOrderDetail
        orderId={viewing}
        onClose={() => setViewing(null)}
        canWrite={canWrite}
        canReceive={canReceive}
        onEdit={(id) => {
          setViewing(null);
          setEditing(id);
        }}
      />
    </div>
  );
}

function PurchaseOrderEditor({
  orderId,
  onClose,
  onSaved,
}: {
  orderId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { suppliers, warehouses, products } = useCatalogs();
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [loaded, setLoaded] = useState(orderId === null);

  useEffect(() => {
    if (!warehouseId && warehouses.data?.length) {
      setWarehouseId((warehouses.data.find((w) => w.is_default) ?? warehouses.data[0])!.id);
    }
  }, [warehouses.data, warehouseId]);

  useEffect(() => {
    if (!orderId) return;
    void (async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, purchase_order_lines(*)")
        .eq("id", orderId)
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setSupplierId(data.supplier_id);
      setWarehouseId(data.warehouse_id);
      setOrderDate(data.order_date);
      setExpected(data.expected_date ?? "");
      setNotes(data.notes ?? "");
      setLines(
        data.purchase_order_lines.map((l) => ({
          key: l.id,
          product_id: l.product_id,
          qty: String(l.qty_ordered),
          price: String(l.unit_cost),
        })),
      );
      setLoaded(true);
    })();
  }, [orderId]);

  const prodList = useMemo(
    () => (products.data ?? []).map((p) => ({ ...p, tax_rate: Number(p.tax_rate) })),
    [products.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0);
      if (!supplierId) throw new Error("Selecciona un proveedor");
      if (!warehouseId) throw new Error("Selecciona un almacén");
      if (valid.length === 0) throw new Error("Agrega al menos una línea con producto y cantidad");
      const header = {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        order_date: orderDate,
        expected_date: expected || null,
        notes: notes || null,
      };
      let id = orderId;
      if (id) {
        const { error } = await supabase.from("purchase_orders").update(header).eq("id", id);
        if (error) throw error;
        const del = await supabase.from("purchase_order_lines").delete().eq("purchase_order_id", id);
        if (del.error) throw del.error;
      } else {
        const { data, error } = await supabase
          .from("purchase_orders")
          .insert({ ...header, folio: "" })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      const { error } = await supabase.from("purchase_order_lines").insert(
        valid.map((l) => ({
          purchase_order_id: id!,
          product_id: l.product_id,
          qty_ordered: Number(l.qty),
          unit_cost: Number(l.price),
        })),
      );
      if (error) throw error;
      return id!;
    },
    onSuccess: (id) => {
      toast.success("Orden de compra guardada");
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      onSaved(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = computeTotals(lines, prodList);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{orderId ? "Editar orden de compra" : "Nueva orden de compra"}</DialogTitle>
        </DialogHeader>
        {!loaded ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Label>Proveedor</Label>
                <select
                  autoFocus
                  className={`${selectClass} mt-1 w-full`}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {(suppliers.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.business_name}
                    </option>
                  ))}
                </select>
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
              <div>
                <Label>Entrega esperada</Label>
                <Input type="date" className="mt-1" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Label>Notas</Label>
                <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <OrderLinesEditor
              lines={lines}
              onChange={setLines}
              products={prodList}
              priceLabel="Costo unitario"
              defaultPrice={(pid) => {
                const p = products.data?.find((x) => x.id === pid);
                return p ? Number(p.last_cost) : undefined;
              }}
            />
          </div>
        )}
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            Total estimado {money(totals.total)} · precios sin IVA
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

function PurchaseOrderDetail({
  orderId,
  onClose,
  canWrite,
  canReceive,
  onEdit,
}: {
  orderId: string | null;
  onClose: () => void;
  canWrite: boolean;
  canReceive: boolean;
  onEdit: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [receiving, setReceiving] = useState(false);

  const detail = useQuery({
    enabled: !!orderId,
    queryKey: ["purchase-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "*, suppliers(business_name), warehouses(code, name), purchase_order_lines(*, products(sku, name)), goods_receipts(id, folio, receipt_date)",
        )
        .eq("id", orderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    void qc.invalidateQueries({ queryKey: ["purchase-order", orderId] });
  };

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("purchase_orders").update({ status: "sent" }).eq("id", orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden marcada como enviada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const reason = window.prompt("Motivo de la cancelación");
      if (reason === null) throw new Error("__skip");
      const { error } = await supabase.rpc("cancel_purchase_order", {
        _purchase_order_id: orderId!,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden cancelada");
      refresh();
    },
    onError: (e: Error) => e.message !== "__skip" && toast.error(e.message),
  });

  const o = detail.data;
  const openStatus = o && ["draft", "sent", "partial"].includes(o.status);

  return (
    <Sheet open={!!orderId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{o ? `Orden de compra ${o.folio}` : "Orden de compra"}</SheetTitle>
        </SheetHeader>
        {detail.isLoading ? (
          <LoadingState />
        ) : detail.error ? (
          <ErrorState error={detail.error} />
        ) : o ? (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="po" status={o.status} />
              <span className="text-muted-foreground">
                {o.suppliers?.business_name} · {o.warehouses?.code} · {dateMX(o.order_date)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite && o.status === "draft" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onEdit(o.id)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => send.mutate()}>
                    <Send className="mr-1 h-4 w-4" /> Marcar enviada
                  </Button>
                </>
              ) : null}
              {canReceive && openStatus ? (
                <Button size="sm" onClick={() => setReceiving(true)}>
                  <PackageCheck className="mr-1 h-4 w-4" /> Recibir
                </Button>
              ) : null}
              <Button size="sm" variant="outline" asChild>
                <Link to="/print/$kind/$orderId" params={{ kind: "po", orderId: o.id }}>
                  <Printer className="mr-1 h-4 w-4" /> Imprimir
                </Link>
              </Button>
              {canWrite && openStatus ? (
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
                  <th className="text-right">Recibido</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {o.purchase_order_lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="num text-xs text-muted-foreground">{l.products?.sku}</span>{" "}
                      {l.products?.name}
                    </td>
                    <td className="num text-right">{qty(l.qty_ordered)}</td>
                    <td className="num text-right">{qty(l.qty_received)}</td>
                    <td className="num text-right">{money(l.unit_cost)}</td>
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
            {o.goods_receipts.length ? (
              <div>
                <p className="mb-1 font-medium">Recepciones</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {o.goods_receipts.map((g) => (
                    <li key={g.id} className="num">
                      {g.folio} · {dateMX(g.receipt_date)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {receiving && o ? (
          <ReceiveDialog
            order={o}
            onClose={() => setReceiving(false)}
            onDone={() => {
              setReceiving(false);
              refresh();
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type ReceiveOrder = {
  id: string;
  folio: string;
  purchase_order_lines: {
    id: string;
    qty_ordered: number;
    qty_received: number;
    unit_cost: number;
    products: { sku: string; name: string } | null;
  }[];
};

function ReceiveDialog({
  order,
  onClose,
  onDone,
}: {
  order: ReceiveOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const pendingLines = order.purchase_order_lines.filter(
    (l) => Number(l.qty_ordered) - Number(l.qty_received) > 0,
  );
  const [values, setValues] = useState<Record<string, { qty: string; cost: string }>>(() =>
    Object.fromEntries(
      pendingLines.map((l) => [
        l.id,
        { qty: String(Number(l.qty_ordered) - Number(l.qty_received)), cost: String(l.unit_cost) },
      ]),
    ),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const receive = useMutation({
    mutationFn: async () => {
      const lines = pendingLines
        .map((l) => ({
          purchase_order_line_id: l.id,
          qty: Number(values[l.id]?.qty || 0),
          unit_cost: Number(values[l.id]?.cost || l.unit_cost),
        }))
        .filter((l) => l.qty > 0);
      if (!lines.length) throw new Error("Captura al menos una cantidad a recibir");
      const { error } = await supabase.rpc("receive_purchase_order", {
        _purchase_order_id: order.id,
        _lines: lines,
        _receipt_date: date,
        ...(notes ? { _notes: notes } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recepción registrada; existencias y costos actualizados");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recibir mercancía — {order.folio}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Fecha de recepción</Label>
            <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas / remisión</Label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Pendiente</th>
              <th className="w-28 text-right">Recibir</th>
              <th className="w-32 text-right">Costo unit.</th>
            </tr>
          </thead>
          <tbody>
            {pendingLines.map((l) => {
              const pending = Number(l.qty_ordered) - Number(l.qty_received);
              return (
                <tr key={l.id}>
                  <td>
                    <span className="num text-xs text-muted-foreground">{l.products?.sku}</span>{" "}
                    {l.products?.name}
                  </td>
                  <td className="num text-right">{qty(pending)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max={pending}
                      step="any"
                      className={`${selectClass} num w-full text-right`}
                      value={values[l.id]?.qty ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [l.id]: { cost: values[l.id]?.cost ?? "", qty: e.target.value } })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={`${selectClass} num w-full text-right`}
                      value={values[l.id]?.cost ?? ""}
                      onChange={(e) =>
                        setValues({ ...values, [l.id]: { qty: values[l.id]?.qty ?? "", cost: e.target.value } })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => receive.mutate()} disabled={receive.isPending}>
            {receive.isPending ? "Registrando…" : "Registrar recepción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

