"use client";

import { useId, useState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { formatNGN } from "@/lib/money";
import type { startCustomPaymentAction } from "@/server/actions/checkout";

/** US-C4 AC2/AC4: pay the deposit or balance; the terms box must be ticked first. */
export function PayForm({
  orderId,
  kind,
  amountKobo,
  action,
}: {
  orderId: string;
  kind: "CUSTOM_DEPOSIT" | "CUSTOM_BALANCE";
  amountKobo: number;
  action: typeof startCustomPaymentAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const [agreed, setAgreed] = useState(false);
  const label = kind === "CUSTOM_DEPOSIT" ? "Pay deposit" : "Pay balance";
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3"
      aria-label={label}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="termsAcknowledged"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-describedby={fieldErrors.termsAcknowledged ? `${id}-error` : undefined}
          className="mt-0.5 size-4"
        />
        I understand the deposit is non-refundable and all sales are final.
      </label>
      {fieldErrors.termsAcknowledged ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {fieldErrors.termsAcknowledged}
        </p>
      ) : null}
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={!agreed || pending}>
          {pending ? "Redirecting to payment…" : `${label} · ${formatNGN(amountKobo)}`}
        </Button>
      </div>
    </form>
  );
}
