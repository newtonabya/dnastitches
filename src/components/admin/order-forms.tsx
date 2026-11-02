"use client";

import { useId, useState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomOrderStatus, PaymentKind } from "@/generated/prisma/enums";
import { useFormAction } from "@/hooks/use-form-action";
import { ALLOWED_TRANSITIONS, STATUS_LABELS } from "@/lib/custom-order/status";
import { koboToNaira, nairaToKobo, percentOfKobo } from "@/lib/money";
import type {
  recordOfflinePaymentAction,
  sendQuoteAction,
  updateAdminNotesAction,
  updateCustomOrderStatus,
} from "@/server/actions/admin/orders";
import type { ActionResult } from "@/server/actions/types";

const textareaClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

/** US-C1 AC2: accessible status <select> (alternative to the board's drag and drop). */
export function StatusControl({
  orderId,
  status,
  depositPaid,
  action,
}: {
  orderId: string;
  status: CustomOrderStatus;
  depositPaid: boolean;
  action: typeof updateCustomOrderStatus;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit } = useFormAction(
    action as (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>,
    { resetOnSuccess: true },
  );
  const [to, setTo] = useState("");
  const next = ALLOWED_TRANSITIONS[status];
  if (next.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        This order is {STATUS_LABELS[status].toLowerCase()}; no further changes.
      </p>
    );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
      aria-label="Change status"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="expectedFrom" value={status} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-to`} className="text-sm font-medium">
          Move to
        </label>
        <select
          id={`${id}-to`}
          name="to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="" disabled>
            Choose a status
          </option>
          {next.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          Note (optional, kept in the audit log)
        </label>
        <textarea id={`${id}-note`} name="note" rows={2} className={textareaClass} />
      </div>
      {to === "CANCELLED" && depositPaid ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p>
            A deposit has been paid. Deposits are non-refundable (D-11): cancelling keeps the
            deposit.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirmForfeit" className="size-4" required />I understand,
            cancel anyway
          </label>
        </div>
      ) : null}
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending || !to}>
          {pending ? "Saving…" : "Update status"}
        </Button>
      </div>
    </form>
  );
}

/** US-C4 AC1: quote, deposit (defaults to DEPOSIT_PERCENT) and delivery fee, in naira. */
export function QuoteForm({
  orderId,
  quotedPriceKobo,
  depositKobo,
  deliveryFeeKobo,
  suggestedDeliveryFeeKobo,
  depositPercent,
  action,
}: {
  orderId: string;
  quotedPriceKobo: number | null;
  depositKobo: number | null;
  deliveryFeeKobo: number | null;
  suggestedDeliveryFeeKobo: number;
  depositPercent: number;
  action: typeof sendQuoteAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const show = (kobo: number | null) => (kobo === null ? "" : String(koboToNaira(kobo)));
  const [quote, setQuote] = useState(show(quotedPriceKobo));
  const [deposit, setDeposit] = useState(show(depositKobo));
  const [depositEdited, setDepositEdited] = useState(depositKobo !== null);

  function onQuoteChange(value: string) {
    setQuote(value);
    const n = Number(value.replace(/,/g, ""));
    if (!depositEdited && Number.isFinite(n) && n > 0) {
      setDeposit(String(koboToNaira(percentOfKobo(nairaToKobo(n), depositPercent))));
    }
  }

  const field = (
    name: string,
    label: string,
    props: React.ComponentProps<"input">,
    hint?: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={`${id}-${name}`}
        name={name}
        inputMode="decimal"
        aria-invalid={fieldErrors[name] ? true : undefined}
        aria-describedby={`${id}-${name}-hint`}
        {...props}
      />
      <p
        id={`${id}-${name}-hint`}
        className={fieldErrors[name] ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {fieldErrors[name] ?? hint}
      </p>
    </div>
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label="Quote"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-4 sm:grid-cols-3">
        {field("quotedPriceNaira", "Quoted price (₦)", {
          value: quote,
          onChange: (e) => onQuoteChange(e.target.value),
          required: true,
        })}
        {field(
          "depositNaira",
          "Deposit (₦)",
          {
            value: deposit,
            onChange: (e) => {
              setDeposit(e.target.value);
              setDepositEdited(true);
            },
            required: true,
          },
          `Defaults to ${depositPercent}% of the quote.`,
        )}
        {field(
          "deliveryFeeNaira",
          "Delivery fee (₦)",
          { defaultValue: show(deliveryFeeKobo ?? suggestedDeliveryFeeKobo) },
          "0 for pickup. Pre-filled from the delivery zone.",
        )}
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Sending…"
            : quotedPriceKobo === null
              ? "Save and send quote"
              : "Update and re-send quote"}
        </Button>
      </div>
    </form>
  );
}

/** US-C4 AC5: record cash or a direct bank transfer. */
export function OfflinePaymentForm({
  orderId,
  defaultKind,
  action,
}: {
  orderId: string;
  defaultKind: Extract<PaymentKind, "CUSTOM_DEPOSIT" | "CUSTOM_BALANCE">;
  action: typeof recordOfflinePaymentAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action, {
    resetOnSuccess: true,
  });
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label="Record offline payment"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-kind`} className="text-sm font-medium">
            Type
          </label>
          <select
            id={`${id}-kind`}
            name="kind"
            defaultValue={defaultKind}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="CUSTOM_DEPOSIT">Deposit</option>
            <option value="CUSTOM_BALANCE">Balance</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-amount`} className="text-sm font-medium">
            Amount (₦)
          </label>
          <Input
            id={`${id}-amount`}
            name="amountNaira"
            inputMode="decimal"
            required
            aria-invalid={fieldErrors.amountNaira ? true : undefined}
            aria-describedby={fieldErrors.amountNaira ? `${id}-amount-error` : undefined}
          />
          {fieldErrors.amountNaira ? (
            <p id={`${id}-amount-error`} className="text-xs text-destructive">
              {fieldErrors.amountNaira}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            Note (optional)
          </label>
          <Input id={`${id}-note`} name="note" placeholder="e.g. Cash at studio" />
        </div>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

export function AdminNotesForm({
  orderId,
  adminNotes,
  action,
}: {
  orderId: string;
  adminNotes: string | null;
  action: typeof updateAdminNotesAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit } = useFormAction(action);
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
      aria-label="Private notes"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor={`${id}-notes`} className="sr-only">
        Private notes
      </label>
      <textarea
        id={`${id}-notes`}
        name="adminNotes"
        rows={4}
        defaultValue={adminNotes ?? ""}
        className={textareaClass}
      />
      <FormMessage state={state} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </form>
  );
}
