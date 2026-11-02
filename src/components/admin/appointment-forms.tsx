"use client";

import { useActionState, useId } from "react";

import { Field, FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { useFormAction } from "@/hooks/use-form-action";
import {
  APPOINTMENT_ACTION_LABELS,
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_TYPE_LABELS,
} from "@/lib/scheduling/appointments";
import type {
  addAvailabilityRuleAction,
  addBlackoutDateAction,
  rescheduleAppointmentAction,
  saveAppointmentNotesAction,
  scheduleAppointmentAction,
  setAppointmentStatusAction,
} from "@/server/actions/admin/appointments";
import type { ActionResult } from "@/server/actions/types";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";
const textareaClass =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** US-F2: one button per allowed status move. */
export function AppointmentStatusButtons({
  appointmentId,
  next,
  action,
}: {
  appointmentId: string;
  next: readonly AppointmentStatus[];
  action: typeof setAppointmentStatusAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  if (next.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-wrap gap-2" aria-label="Change status">
        <input type="hidden" name="appointmentId" value={appointmentId} />
        {next.map((to) => (
          <Button
            key={to}
            type="submit"
            name="to"
            value={to}
            size="sm"
            variant={to === "CANCELLED" ? "outline" : to === "CONFIRMED" ? "default" : "secondary"}
            disabled={pending}
          >
            {APPOINTMENT_ACTION_LABELS[to] ?? to}
          </Button>
        ))}
      </form>
      <FormMessage state={state} />
    </div>
  );
}

/** US-F2: move to any studio-local date and time. */
export function AdminRescheduleForm({
  appointmentId,
  date,
  time,
  timeZoneLabel,
  action,
}: {
  appointmentId: string;
  date: string;
  time: string;
  timeZoneLabel: string;
  action: typeof rescheduleAppointmentAction;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Reschedule"
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="date" type="date" defaultValue={date} error={fieldErrors.date} />
        <Field
          label={`Time (${timeZoneLabel})`}
          name="time"
          type="time"
          defaultValue={time}
          error={fieldErrors.time}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        Move appointment
      </Button>
    </form>
  );
}

export function AppointmentNotesForm({
  appointmentId,
  adminNotes,
  action,
}: {
  appointmentId: string;
  adminNotes: string | null;
  action: typeof saveAppointmentNotesAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit } = useFormAction(action);
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Private notes"
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <label htmlFor={`${id}-notes`} className="text-sm font-medium">
        Private notes
      </label>
      <textarea
        id={`${id}-notes`}
        name="adminNotes"
        rows={3}
        maxLength={5000}
        defaultValue={adminNotes ?? ""}
        className={textareaClass}
      />
      <FormMessage state={state} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        Save notes
      </Button>
    </form>
  );
}

/** Book a fitting, pickup, measurement or consultation for a custom order. */
export function ScheduleAppointmentForm({
  customOrderId,
  timeZoneLabel,
  defaultMinutes,
  action,
}: {
  customOrderId: string;
  timeZoneLabel: string;
  defaultMinutes: number;
  action: typeof scheduleAppointmentAction;
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
      aria-label="Book an appointment"
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="customOrderId" value={customOrderId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-type`} className="text-sm font-medium">
            Type
          </label>
          <select id={`${id}-type`} name="type" defaultValue="FITTING" className={selectClass}>
            {Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-mode`} className="text-sm font-medium">
            Where
          </label>
          <select id={`${id}-mode`} name="mode" defaultValue="IN_STUDIO" className={selectClass}>
            {Object.entries(APPOINTMENT_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Date" name="date" type="date" error={fieldErrors.date} />
        <Field label={`Time (${timeZoneLabel})`} name="time" type="time" error={fieldErrors.time} />
        <Field
          label="Length (minutes)"
          name="durationMinutes"
          type="number"
          min={15}
          max={480}
          step={15}
          defaultValue={defaultMinutes}
          error={fieldErrors.durationMinutes}
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        Book and email the customer
      </Button>
    </form>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Weekly booking hours (US-F1 DoD). */
export function AvailabilityRuleForm({ action }: { action: typeof addAvailabilityRuleAction }) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Add booking hours"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-weekday`} className="text-sm font-medium">
          Day
        </label>
        <select id={`${id}-weekday`} name="weekday" defaultValue="1" className={selectClass}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <Field label="From" name="start" type="time" defaultValue="10:00" error={fieldErrors.start} />
      <Field label="To" name="end" type="time" defaultValue="16:00" error={fieldErrors.end} />
      <Button type="submit" size="sm" disabled={pending}>
        Add hours
      </Button>
      <div className="basis-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Blackout dates (US-F1 DoD). */
export function BlackoutDateForm({ action }: { action: typeof addBlackoutDateAction }) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action, {
    resetOnSuccess: true,
  });
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Block a date"
      className="flex flex-wrap items-end gap-3"
    >
      <Field label="Date" name="date" type="date" error={fieldErrors.date} />
      <Field label="Reason (optional)" name="reason" maxLength={200} error={fieldErrors.reason} />
      <Button type="submit" size="sm" disabled={pending}>
        Block date
      </Button>
      <div className="basis-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** A small "Remove" form for one row (hours or blackout date). */
export function RemoveButton({ id, label, action }: { id: string; label: string; action: Action }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        size="xs"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${label}`}
      >
        Remove
      </Button>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}
