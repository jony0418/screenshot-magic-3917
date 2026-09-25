import { cn } from "@/lib/utils";
import { PO_STATUS_LABEL, SO_STATUS_LABEL } from "@/lib/format";

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-accent text-accent-foreground",
  confirmed: "bg-accent text-accent-foreground",
  partial: "bg-warning/20 text-warning-foreground",
  received: "bg-success/15 text-success",
  shipped: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status, kind }: { status: string; kind: "po" | "so" }) {
  const label = (kind === "po" ? PO_STATUS_LABEL : SO_STATUS_LABEL)[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
