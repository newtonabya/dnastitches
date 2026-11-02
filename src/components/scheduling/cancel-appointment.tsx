"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { cancelOwnAppointmentAction } from "@/server/actions/appointments";
import type { ActionResult } from "@/server/actions/types";

/** US-F1 AC5: cancel, with a confirm step so it can't happen by accident. */
export function CancelAppointmentButton({
  appointmentId,
  label,
  action,
}: {
  appointmentId: string;
  /** What's being cancelled, for screen readers. */
  label: string;
  action: typeof cancelOwnAppointmentAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <span className="text-sm">Cancel this appointment?</span>
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>
            {pending ? "Cancelling…" : "Yes, cancel it"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirming(true)}
          aria-label={`Cancel ${label}`}
        >
          Cancel
        </Button>
      )}
      <FormMessage state={state} />
    </div>
  );
}
