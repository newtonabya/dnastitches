"use client";

import { useId, useState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import type {
  bookConsultationAction,
  rescheduleOwnAppointmentAction,
} from "@/server/actions/appointments";

import { type SlotOption, SlotPicker } from "./slot-picker";

const radioCard =
  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary";

/** US-F1: book a consultation (mode, optional linked request, slot, notes). */
export function BookingForm({
  slots,
  timeZone,
  orders,
  defaultOrderId,
  autoConfirm,
  action,
}: {
  slots: SlotOption[];
  timeZone: string;
  orders: { id: string; reference: string; title: string }[];
  defaultOrderId?: string;
  autoConfirm: boolean;
  action: typeof bookConsultationAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const [mode, setMode] = useState<"IN_STUDIO" | "VIDEO">("IN_STUDIO");
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Book a consultation"
      className="flex flex-col gap-6"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">How would you like to meet?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={radioCard}>
            <input
              type="radio"
              name="mode"
              value="IN_STUDIO"
              checked={mode === "IN_STUDIO"}
              onChange={() => setMode("IN_STUDIO")}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-medium">In the studio</span>
              <span className="block text-muted-foreground">
                See fabrics in person and get measured.
              </span>
            </span>
          </label>
          <label className={radioCard}>
            <input
              type="radio"
              name="mode"
              value="VIDEO"
              checked={mode === "VIDEO"}
              onChange={() => setMode("VIDEO")}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-medium">Video call</span>
              <span className="block text-muted-foreground">
                We&apos;ll email you a link before the call.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {orders.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-order`} className="text-sm font-medium">
            Which request is this about?
          </label>
          <select
            id={`${id}-order`}
            name="customOrderId"
            defaultValue={defaultOrderId ?? ""}
            aria-invalid={fieldErrors.customOrderId ? true : undefined}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Not about a specific request</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.reference})
              </option>
            ))}
          </select>
          {fieldErrors.customOrderId ? (
            <p className="text-sm text-destructive">{fieldErrors.customOrderId}</p>
          ) : null}
        </div>
      ) : null}

      <SlotPicker slots={slots} timeZone={timeZone} error={fieldErrors.startsAt} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-notes`} className="text-sm font-medium">
          Anything we should know?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={3}
          maxLength={1000}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <FormMessage state={state && !state.ok && state.fieldErrors?.startsAt ? null : state} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Booking…" : autoConfirm ? "Book appointment" : "Request appointment"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {autoConfirm
          ? "You'll get a confirmation email with a calendar invite."
          : "We'll confirm by email, with a calendar invite."}{" "}
        You can cancel or move it up to 24 hours before.
      </p>
    </form>
  );
}

/** US-F1 AC5: pick a new time for my consultation. */
export function RescheduleForm({
  appointmentId,
  slots,
  timeZone,
  action,
}: {
  appointmentId: string;
  slots: SlotOption[];
  timeZone: string;
  action: typeof rescheduleOwnAppointmentAction;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Choose a new time"
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <SlotPicker slots={slots} timeZone={timeZone} error={fieldErrors.startsAt} />
      <FormMessage state={state} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? "Moving…" : "Move appointment"}
      </Button>
    </form>
  );
}
