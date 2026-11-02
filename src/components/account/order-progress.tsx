import type { CustomOrderStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS, statusToProgress } from "@/lib/custom-order/status";

/** US-D1 AC2: progress bar with the fixed status → percentage mapping. Cancelled shows no bar. */
export function OrderProgress({ status }: { status: CustomOrderStatus }) {
  const progress = statusToProgress(status);
  if (progress === null) {
    return <p className="text-sm font-medium text-muted-foreground">{STATUS_LABELS[status]}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{STATUS_LABELS[status]}</span>
        <span className="tabular-nums">{progress}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Order progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${progress}%, ${STATUS_LABELS[status]}`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
