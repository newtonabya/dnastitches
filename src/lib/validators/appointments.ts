import { z } from "zod";

import { AppointmentMode, AppointmentStatus, AppointmentType } from "@/generated/prisma/enums";
import { parseLocalDate, parseMinute } from "@/lib/scheduling/time";

const id = z.string().trim().min(1).max(64);
const blankToUndefined = (v: unknown) =>
  v === null || (typeof v === "string" && v.trim() === "") ? undefined : v;
const optionalText = (max: number, label: string) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional(),
  );

/** An ISO instant chosen from the offered slots (re-checked server-side). */
const slotStart = z
  .string({ error: "Choose a time" })
  .trim()
  .refine((v) => v !== "" && !Number.isNaN(Date.parse(v)), "Choose a time")
  .transform((v) => new Date(v));

const localDate = z
  .string({ error: "Choose a date" })
  .trim()
  .refine((v) => parseLocalDate(v) !== null, "Enter a valid date");

const timeOfDay = z
  .string({ error: "Enter a time" })
  .trim()
  .refine((v) => parseMinute(v) !== null, "Enter a time like 14:30")
  .transform((v) => parseMinute(v)!);

/** US-F1 AC2: book a consultation slot, optionally linked to one of my custom requests. */
export const bookingSchema = z.object({
  startsAt: slotStart,
  mode: z.enum(AppointmentMode, { error: "Choose in the studio or a video call" }),
  customOrderId: z.preprocess(blankToUndefined, id.optional()),
  notes: optionalText(1000, "Notes"),
});
export type BookingInput = z.output<typeof bookingSchema>;

/** US-F1 AC5: move my appointment to another offered slot. */
export const customerRescheduleSchema = z.object({ appointmentId: id, startsAt: slotStart });
export type CustomerRescheduleInput = z.output<typeof customerRescheduleSchema>;

export const appointmentIdSchema = z.object({ appointmentId: id });

/** US-F2: confirm, complete, no-show or cancel. */
export const adminAppointmentStatusSchema = z.object({
  appointmentId: id,
  to: z.enum(AppointmentStatus, { error: "Choose a status" }),
});
export type AdminAppointmentStatusInput = z.output<typeof adminAppointmentStatusSchema>;

/** US-F2: reschedule to any free studio-local date and time (not limited to the weekly hours). */
export const adminRescheduleSchema = z.object({
  appointmentId: id,
  date: localDate,
  time: timeOfDay,
});
export type AdminRescheduleInput = z.output<typeof adminRescheduleSchema>;

/** Owner schedules a fitting, pickup or other appointment for a custom order. */
export const adminScheduleSchema = z.object({
  customOrderId: id,
  type: z.enum(AppointmentType, { error: "Choose a type" }),
  mode: z.enum(AppointmentMode, { error: "Choose in the studio or a video call" }),
  date: localDate,
  time: timeOfDay,
  durationMinutes: z.coerce
    .number({ error: "Enter a length in minutes" })
    .int("Enter whole minutes")
    .min(15, "At least 15 minutes")
    .max(480, "At most 8 hours"),
  notes: optionalText(1000, "Notes"),
});
export type AdminScheduleInput = z.output<typeof adminScheduleSchema>;

export const adminAppointmentNotesSchema = z.object({
  appointmentId: id,
  adminNotes: optionalText(5000, "Notes"),
});

/** Weekly studio hours (US-F1 DoD: AvailabilityRule). */
export const availabilityRuleSchema = z
  .object({
    weekday: z.coerce
      .number({ error: "Choose a day" })
      .int()
      .min(0, "Choose a day")
      .max(6, "Choose a day"),
    start: timeOfDay,
    end: z
      .string({ error: "Enter a time" })
      .trim()
      .refine((v) => v === "24:00" || parseMinute(v) !== null, "Enter a time like 17:00")
      .transform((v) => (v === "24:00" ? 24 * 60 : parseMinute(v)!)),
  })
  .refine((v) => v.start < v.end, { path: ["end"], message: "End must be after start" });
export type AvailabilityRuleInput = z.output<typeof availabilityRuleSchema>;

/** A date with no bookings (US-F1 DoD: BlackoutDate). */
export const blackoutDateSchema = z.object({
  date: localDate,
  reason: optionalText(200, "Reason"),
});
export type BlackoutDateInput = z.output<typeof blackoutDateSchema>;
