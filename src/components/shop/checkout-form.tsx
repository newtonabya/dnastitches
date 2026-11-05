"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { formatNGN } from "@/lib/money";
import type { startCheckoutAction } from "@/server/actions/checkout";
import type { ActionResult } from "@/server/actions/types";

export interface CheckoutAddress {
  id: string;
  summary: string;
  isDefault: boolean;
  /** The courier's live price or the zone's flat fee; null when neither covers the address. */
  delivery: { feeKobo: number; etaDays: number | null; label: string } | null;
}

/**
 * US-A4 AC2–4: pickup or delivery, the delivery fee shown before paying, and the
 * final-sale box that must be ticked before Pay is enabled.
 */
export function CheckoutForm({
  productId,
  priceKobo,
  addresses,
  studioAddress,
  studioHours,
  action,
}: {
  productId: string;
  priceKobo: number;
  addresses: CheckoutAddress[];
  studioAddress: string | null;
  studioHours: string | null;
  action: typeof startCheckoutAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(
    action as (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>,
  );
  const deliverable = addresses.filter((a) => a.delivery);
  const [method, setMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [addressId, setAddressId] = useState(
    (deliverable.find((a) => a.isDefault) ?? deliverable[0])?.id ?? "",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const chosen = addresses.find((a) => a.id === addressId);
  const feeKobo = method === "DELIVERY" ? (chosen?.delivery?.feeKobo ?? 0) : 0;
  const claimed = fieldErrors.code === "CLAIMED";

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
      aria-label="Checkout"
    >
      <input type="hidden" name="productId" value={productId} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">How would you like to receive it?</legend>
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="radio"
            name="fulfillmentMethod"
            value="PICKUP"
            checked={method === "PICKUP"}
            onChange={() => setMethod("PICKUP")}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Pick up from the studio</span> · free
            <span className="block text-muted-foreground">
              {studioAddress ?? "Studio address will be confirmed by email."}
              {studioHours ? ` · ${studioHours}` : ""}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="radio"
            name="fulfillmentMethod"
            value="DELIVERY"
            checked={method === "DELIVERY"}
            onChange={() => setMethod("DELIVERY")}
            disabled={deliverable.length === 0}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Deliver to me</span>
            <span className="block text-muted-foreground">
              {addresses.length === 0
                ? "Add a delivery address in your profile to choose delivery."
                : deliverable.length === 0
                  ? "We don't deliver to your saved addresses yet, so pickup only."
                  : "Delivery price for your address, shown below."}
            </span>
          </span>
        </label>
      </fieldset>

      {method === "DELIVERY" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-address`} className="text-sm font-medium">
            Delivery address
          </label>
          <select
            id={`${id}-address`}
            name="addressId"
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            aria-invalid={fieldErrors.addressId ? true : undefined}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.delivery}>
                {a.summary}
                {a.delivery ? ` · ${formatNGN(a.delivery.feeKobo)}` : " · no delivery"}
              </option>
            ))}
          </select>
          {chosen?.delivery ? (
            <p className="text-xs text-muted-foreground">
              {chosen.delivery.label}
              {chosen.delivery.etaDays ? ` · usually ${chosen.delivery.etaDays} days` : ""}
            </p>
          ) : null}
          {fieldErrors.addressId ? (
            <p className="text-sm text-destructive">{fieldErrors.addressId}</p>
          ) : null}
          <Link href="/account/profile" className="text-sm underline">
            Add or manage addresses
          </Link>
        </div>
      ) : null}

      <dl className="flex flex-col gap-1 rounded-md border p-4 text-sm" aria-label="Order summary">
        <div className="flex justify-between">
          <dt>Piece</dt>
          <dd className="tabular-nums">{formatNGN(priceKobo)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{method === "PICKUP" ? "Pickup" : "Delivery"}</dt>
          <dd className="tabular-nums">{feeKobo === 0 ? "Free" : formatNGN(feeKobo)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="checkout-total">
            {formatNGN(priceKobo + feeKobo)}
          </dd>
        </div>
      </dl>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="finalSaleAcknowledged"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          aria-describedby={fieldErrors.finalSaleAcknowledged ? `${id}-ack-error` : undefined}
          className="mt-0.5 size-4"
        />
        <span>
          I understand all sales are final, with no refunds or returns. Manufacturing defects
          reported within 7 days are repaired free of charge.{" "}
          <Link href="/policies/terms" className="underline">
            Terms
          </Link>
        </span>
      </label>
      {fieldErrors.finalSaleAcknowledged ? (
        <p id={`${id}-ack-error`} className="text-sm text-destructive">
          {fieldErrors.finalSaleAcknowledged}
        </p>
      ) : null}

      <FormMessage state={state} />
      {claimed ? (
        <Button asChild variant="outline">
          <Link href={`/custom/request?fromProduct=${encodeURIComponent(productId)}`}>
            Request Custom Version
          </Link>
        </Button>
      ) : null}

      <Button type="submit" size="lg" disabled={!acknowledged || pending}>
        {pending ? "Redirecting to payment…" : `Pay ${formatNGN(priceKobo + feeKobo)}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        You&apos;ll pay securely with Paystack (card, bank transfer or USSD). We hold the piece for
        you for 15 minutes.
      </p>
    </form>
  );
}
