import { Badge } from "@/components/ui/badge";
import type { RepairStatus } from "@/generated/prisma/enums";
import { REPAIR_STATUS_DESCRIPTIONS, REPAIR_STATUS_LABELS } from "@/lib/repairs";

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** One repair request as the customer sees it (US-D3 AC3): status, explanation, reason. */
export function RepairStatusItem({
  item,
  status,
  description,
  rejectionReason,
  createdAt,
}: {
  item: string;
  status: RepairStatus;
  description: string;
  rejectionReason: string | null;
  createdAt: Date;
}) {
  return (
    <article
      aria-label={`Repair request: ${item}`}
      className="flex flex-col gap-2 rounded-lg border p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{item}</span>
        <Badge
          variant={
            status === "REJECTED" ? "outline" : status === "RESOLVED" ? "secondary" : "default"
          }
          data-testid="repair-status"
        >
          {REPAIR_STATUS_LABELS[status]}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        Reported {dateFormat.format(createdAt)} · {REPAIR_STATUS_DESCRIPTIONS[status]}
      </p>
      {status === "REJECTED" && rejectionReason ? <p>Reason: {rejectionReason}</p> : null}
      <p className="line-clamp-3 whitespace-pre-line">{description}</p>
    </article>
  );
}
