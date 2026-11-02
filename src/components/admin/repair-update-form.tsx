"use client";

import { useId, useState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { RepairStatus } from "@/generated/prisma/enums";
import { useFormAction } from "@/hooks/use-form-action";
import { REPAIR_STATUS_LABELS, REPAIR_TRANSITIONS } from "@/lib/repairs";
import type { updateRepairRequest } from "@/server/actions/admin/repairs";

const textareaClass =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** US-D3 AC3: move a repair along (rejecting needs a reason) and keep private notes. */
export function RepairUpdateForm({
  repairId,
  status,
  adminNotes,
  label,
  action,
}: {
  repairId: string;
  status: RepairStatus;
  adminNotes: string | null;
  /** Names the repair for screen readers, e.g. the item and customer. */
  label: string;
  action: typeof updateRepairRequest;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const [to, setTo] = useState<RepairStatus>(status);
  const options = [status, ...REPAIR_TRANSITIONS[status]];
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label={`Update repair: ${label}`}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="repairId" value={repairId} />
      {options.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-to`} className="text-sm font-medium">
            Status
          </label>
          <select
            id={`${id}-to`}
            name="to"
            value={to}
            onChange={(e) => setTo(e.target.value as RepairStatus)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {s === status ? `${REPAIR_STATUS_LABELS[s]} (current)` : REPAIR_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="to" value={status} />
      )}
      {to === "REJECTED" && status !== "REJECTED" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-reason`} className="text-sm font-medium">
            Reason (the customer sees this)
          </label>
          <textarea
            id={`${id}-reason`}
            name="rejectionReason"
            rows={2}
            maxLength={1000}
            aria-invalid={fieldErrors.rejectionReason ? true : undefined}
            aria-describedby={fieldErrors.rejectionReason ? `${id}-reason-error` : undefined}
            className={textareaClass}
          />
          {fieldErrors.rejectionReason ? (
            <p id={`${id}-reason-error`} className="text-sm text-destructive">
              {fieldErrors.rejectionReason}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-notes`} className="text-sm font-medium">
          Private notes
        </label>
        <textarea
          id={`${id}-notes`}
          name="adminNotes"
          rows={2}
          maxLength={5000}
          defaultValue={adminNotes ?? ""}
          className={textareaClass}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {to !== status ? `Move to ${REPAIR_STATUS_LABELS[to]}` : "Save notes"}
      </Button>
    </form>
  );
}
