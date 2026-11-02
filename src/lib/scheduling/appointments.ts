import type { AppointmentMode, AppointmentStatus, AppointmentType } from "@/generated/prisma/enums";

/** Appointment rules shared by the booking flow, admin and tests (US-F1, US-F2). */

/** Customers can cancel or reschedule up to this long before the start (US-F1 AC5). */
export const CUSTOMER_CHANGE_CUTOFF_HOURS = 24;
/** New bookings must start at least this far ahead, so they're always changeable. */
export const BOOKING_MIN_NOTICE_HOURS = 24;

export const ACTIVE_APPOINTMENT_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
] as const satisfies AppointmentStatus[];

export function isActiveAppointment(status: AppointmentStatus): boolean {
  return (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

/** AC5: active, and at least 24 h before the start. */
export function canCustomerChange(
  appointment: { status: AppointmentStatus; startsAt: Date },
  now: Date,
): boolean {
  return (
    isActiveAppointment(appointment.status) &&
    appointment.startsAt.getTime() - now.getTime() >= CUSTOMER_CHANGE_CUTOFF_HOURS * 3600_000
  );
}

/** Admin status moves (US-F2). Rescheduling is separate and keeps the status. */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}

/** Completed / no-show only make sense once the appointment has started. */
export function needsStarted(to: AppointmentStatus): boolean {
  return to === "COMPLETED" || to === "NO_SHOW";
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  CONSULTATION: "Consultation",
  MEASUREMENT: "Measurement",
  FITTING: "Fitting",
  PICKUP: "Pickup",
};

export const APPOINTMENT_MODE_LABELS: Record<AppointmentMode, string> = {
  IN_STUDIO: "In the studio",
  VIDEO: "Video call",
};

/** Labels for the admin action buttons. */
export const APPOINTMENT_ACTION_LABELS: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMED: "Confirm",
  COMPLETED: "Mark completed",
  NO_SHOW: "Mark no-show",
  CANCELLED: "Cancel",
};
