import type { AppointmentStatus, AppointmentType } from "@/generated/prisma/enums";

import { isActiveAppointment } from "./appointments";

/** Fitting and pickup reminder rules (US-G1). Pure, so the timing is unit-tested. */

/** AC1: 48 h and 3 h before the start. */
export const REMINDER_OFFSETS_MINUTES = [48 * 60, 3 * 60] as const;
export const REMINDER_TYPES = ["FITTING", "PICKUP"] as const satisfies AppointmentType[];
/** AC4: the first attempt plus up to 3 retries. */
export const MAX_REMINDER_ATTEMPTS = 4;
/** A runner's claim on a reminder expires after this, so a crashed run can't block it. */
export const REMINDER_LEASE_MINUTES = 10;

export interface ReminderAppointment {
  type: AppointmentType;
  status: AppointmentStatus;
  startsAt: Date;
}

export interface PlannedReminder {
  offsetMinutes: number;
  sendAt: Date;
}

export function needsReminders(a: ReminderAppointment): boolean {
  return (REMINDER_TYPES as readonly string[]).includes(a.type) && isActiveAppointment(a.status);
}

/**
 * The reminders an appointment should have right now. A reminder whose time has
 * already passed when the appointment is booked or moved isn't planned: the booking
 * email (with its calendar invite) covers it.
 */
export function plannedReminders(a: ReminderAppointment, now: Date): PlannedReminder[] {
  if (!needsReminders(a)) return [];
  return REMINDER_OFFSETS_MINUTES.map((offsetMinutes) => ({
    offsetMinutes,
    sendAt: new Date(a.startsAt.getTime() - offsetMinutes * 60_000),
  })).filter((r) => r.sendAt > now);
}

export type ReminderDecision = "SEND" | "SKIP_INACTIVE" | "SKIP_SUPERSEDED";

/**
 * At send time: skip if the appointment is no longer an upcoming fitting/pickup, or if
 * a closer reminder for the same appointment is also due (e.g. the job was down and
 * both the 48 h and 3 h reminders are overdue: only the 3 h one goes out).
 */
export function decideReminder(
  reminder: { offsetMinutes: number },
  appointment: ReminderAppointment,
  dueSiblingOffsets: readonly number[],
  now: Date,
): ReminderDecision {
  if (!needsReminders(appointment) || appointment.startsAt <= now) return "SKIP_INACTIVE";
  if (dueSiblingOffsets.some((o) => o < reminder.offsetMinutes)) return "SKIP_SUPERSEDED";
  return "SEND";
}
