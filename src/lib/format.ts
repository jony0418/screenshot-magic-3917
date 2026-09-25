const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function money(value: number | string | null | undefined): string {
  return currencyFormatter.format(Number(value ?? 0));
}

export function qty(value: number | string | null | undefined): string {
  return numberFormatter.format(Number(value ?? 0));
}

export function dateMX(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTimeMX(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const IVA_RATE = 0.16;

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  partial: "Parcial",
  received: "Recibida",
  cancelled: "Cancelada",
};

export const SO_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  confirmed: "Confirmada",
  partial: "Parcial",
  shipped: "Surtida",
  cancelled: "Cancelada",
};

export const MOVEMENT_LABEL: Record<string, string> = {
  IN_PURCHASE: "Entrada por compra",
  OUT_SALE: "Salida por venta",
  ADJUST_IN: "Ajuste (+)",
  ADJUST_OUT: "Ajuste (−)",
  CANCEL_REVERSAL: "Reversa por cancelación",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  compras: "Compras",
  ventas: "Ventas",
  almacen: "Almacén",
};
