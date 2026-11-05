"use client";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import type { CourierRate } from "@/lib/courier/types";
import { formatNGN } from "@/lib/money";
import type { bookShipmentAction, refreshShipmentAction } from "@/server/actions/admin/shipments";

/** US-D5: choose a delivery option and book the courier. */
export function BookCourierForm({
  kind,
  id,
  rates,
  chargedKobo,
  action,
}: {
  kind: "ORDER" | "CUSTOM_ORDER";
  id: string;
  rates: CourierRate[];
  /** What the customer paid for delivery, to compare against. */
  chargedKobo: number | null;
  action: typeof bookShipmentAction;
}) {
  const { state, pending, onSubmit, fieldErrors } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} aria-label="Book a courier" className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Delivery option</legend>
        {rates.map((rate, i) => (
          <label
            key={rate.rateId}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="rateId"
              value={rate.rateId}
              defaultChecked={i === 0}
              className="mt-0.5 size-4"
            />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{rate.courierName}</span>
              <span className="text-muted-foreground">
                {formatNGN(rate.feeKobo)}
                {rate.etaDays ? ` · up to ${rate.etaDays} days` : ""}
              </span>
            </span>
          </label>
        ))}
        {fieldErrors.rateId ? (
          <p className="text-sm text-destructive">{fieldErrors.rateId}</p>
        ) : null}
      </fieldset>
      {chargedKobo !== null ? (
        <p className="text-xs text-muted-foreground">
          The customer paid {formatNGN(chargedKobo)} for delivery.
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Booking…" : "Book courier"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function RefreshTrackingForm({
  shipmentId,
  action,
}: {
  shipmentId: string;
  action: typeof refreshShipmentAction;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        {pending ? "Checking…" : "Check tracking now"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
