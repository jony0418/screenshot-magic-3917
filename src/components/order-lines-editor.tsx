import { Plus, Trash2 } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { money, qty as fmtQty } from "@/lib/format";

export const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export type EditorLine = {
  key: string;
  product_id: string;
  qty: string;
  price: string;
  discount?: string;
};

export type EditorProduct = { id: string; sku: string; name: string; tax_rate: number };

export function newLine(): EditorLine {
  return { key: crypto.randomUUID(), product_id: "", qty: "1", price: "0", discount: "0" };
}

export function lineAmount(l: EditorLine) {
  const disc = Number(l.discount || 0) / 100;
  return Number(l.qty || 0) * Number(l.price || 0) * (1 - disc);
}

export function computeTotals(lines: EditorLine[], products: EditorProduct[]) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    if (!l.product_id) continue;
    const amt = lineAmount(l);
    const p = products.find((x) => x.id === l.product_id);
    subtotal += amt;
    tax += amt * Number(p?.tax_rate ?? 0.16);
  }
  return { subtotal, tax, total: subtotal + tax };
}

export function OrderLinesEditor({
  lines,
  onChange,
  products,
  priceLabel,
  canEditPrice = true,
  showDiscount = false,
  defaultPrice,
  available,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  products: EditorProduct[];
  priceLabel: string;
  canEditPrice?: boolean;
  showDiscount?: boolean;
  defaultPrice?: (productId: string) => number | undefined;
  available?: Record<string, number>;
}) {
  const tableRef = useRef<HTMLTableElement>(null);

  function update(key: string, patch: Partial<EditorLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    onChange([...lines, newLine()]);
    setTimeout(() => {
      const selects = tableRef.current?.querySelectorAll<HTMLSelectElement>("select[data-product]");
      selects?.[selects.length - 1]?.focus();
    }, 0);
  }

  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addLine();
    }
  }

  const totals = computeTotals(lines, products);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table ref={tableRef} className="data-table w-full">
          <thead>
            <tr>
              <th className="min-w-[240px]">Producto</th>
              {available ? <th className="text-right">Disponible</th> : null}
              <th className="w-24 text-right">Cantidad</th>
              <th className="w-32 text-right">{priceLabel}</th>
              {showDiscount ? <th className="w-20 text-right">Desc. %</th> : null}
              <th className="w-32 text-right">Importe</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const avail = available?.[l.product_id];
              const short = available && l.product_id && Number(l.qty) > (avail ?? 0);
              return (
                <tr key={l.key}>
                  <td>
                    <select
                      data-product
                      className={`${selectClass} w-full`}
                      value={l.product_id}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const price = defaultPrice?.(pid);
                        update(l.key, {
                          product_id: pid,
                          ...(price !== undefined ? { price: String(price) } : {}),
                        });
                      }}
                    >
                      <option value="">Selecciona un producto…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  {available ? (
                    <td className={`num text-right ${short ? "text-destructive font-semibold" : ""}`}>
                      {l.product_id ? fmtQty(avail ?? 0) : "—"}
                    </td>
                  ) : null}
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={`${selectClass} num w-full text-right`}
                      value={l.qty}
                      onChange={(e) => update(l.key, { qty: e.target.value })}
                      onKeyDown={onEnter}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      disabled={!canEditPrice}
                      className={`${selectClass} num w-full text-right disabled:opacity-70`}
                      value={l.price}
                      onChange={(e) => update(l.key, { price: e.target.value })}
                      onKeyDown={onEnter}
                    />
                  </td>
                  {showDiscount ? (
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        disabled={!canEditPrice}
                        className={`${selectClass} num w-full text-right`}
                        value={l.discount ?? "0"}
                        onChange={(e) => update(l.key, { discount: e.target.value })}
                        onKeyDown={onEnter}
                      />
                    </td>
                  ) : null}
                  <td className="num text-right">{money(lineAmount(l))}</td>
                  <td>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="Quitar línea"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="mr-1 h-4 w-4" /> Agregar línea
          <span className="ml-2 text-xs text-muted-foreground">(Enter)</span>
        </Button>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="num text-right">{money(totals.subtotal)}</dd>
          <dt className="text-muted-foreground">IVA</dt>
          <dd className="num text-right">{money(totals.tax)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="num text-right font-semibold">{money(totals.total)}</dd>
        </dl>
      </div>
    </div>
  );
}
