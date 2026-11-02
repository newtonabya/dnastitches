import type { InventoryStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const STATUS_BADGE_LABELS: Record<InventoryStatus, string> = {
  AVAILABLE: "Available",
  LOW_STOCK: "Last One",
  SOLD_OUT: "1-of-1 · Sold",
};

/**
 * Availability badge (US-A1 AC2–4). Always carries text, so status is never
 * conveyed by colour or greyscale alone (NFR-2).
 */
export function StatusBadge({
  status,
  className,
}: {
  status: InventoryStatus;
  className?: string;
}) {
  return (
    <Badge
      data-status={status}
      variant={status === "AVAILABLE" ? "outline" : status === "SOLD_OUT" ? "secondary" : "default"}
      className={cn(
        status === "AVAILABLE" && "bg-background/90 text-muted-foreground",
        status === "LOW_STOCK" && "bg-brand text-brand-foreground",
        status === "SOLD_OUT" && "bg-foreground text-background",
        className,
      )}
    >
      {STATUS_BADGE_LABELS[status]}
    </Badge>
  );
}
