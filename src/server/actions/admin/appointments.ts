"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/scheduling/appointments";
import {
  adminAppointmentNotesSchema,
  adminAppointmentStatusSchema,
  adminRescheduleSchema,
  adminScheduleSchema,
  availabilityRuleSchema,
  blackoutDateSchema,
} from "@/lib/validators/appointments";
import { idSchema } from "@/lib/validators/catalog";
import { fieldErrors } from "@/lib/validators/fields";
import { getAdminForAction } from "@/server/auth/admin";
import {
  type AdminAppointmentResult,
  addAvailabilityRule,
  addBlackoutDate,
  deleteAvailabilityRule,
  deleteBlackoutDate,
  rescheduleAppointment,
  saveAppointmentNotes,
  scheduleAppointment,
  setAppointmentStatus,
} from "@/server/data/appointments";
import { notifyAppointment } from "@/server/notifications/appointments";
import { bookingConfig } from "@/server/scheduling-config";

import type { ActionResult } from "../types";

const NO_ACCESS: ActionResult = { ok: false, formError: "You don't have access to do that." };

function revalidate() {
  revalidatePath("/admin/appointments");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/admin/orders", "layout");
  revalidatePath("/account/appointments");
  revalidatePath("/custom/book");
}

function failure(result: Extract<AdminAppointmentResult, { ok: false }>): ActionResult {
  const formError = {
    NOT_FOUND: "That appointment or order no longer exists.",
    INVALID_TRANSITION: `This appointment is ${APPOINTMENT_STATUS_LABELS[result.from ?? "CANCELLED"].toLowerCase()} and can't be changed that way.`,
    NOT_STARTED: "You can only mark an appointment completed or no-show once it has started.",
    INVALID_TIME: "That time doesn't exist on that day (clock change). Choose another.",
    IN_PAST: "Choose a time in the future.",
    OVERLAP: "That time overlaps another appointment.",
  }[result.code];
  return { ok: false, formError };
}

/** US-F2: confirm, complete, no-show or cancel. The customer is emailed on confirm/cancel. */
export async function setAppointmentStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = adminAppointmentStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, formError: "Choose a valid status." };
  const result = await setAppointmentStatus(prisma, parsed.data, new Date());
  if (!result.ok) return failure(result);
  if (result.status === "CONFIRMED" || result.status === "CANCELLED")
    notifyAppointment(result.appointmentId, result.status, { byCustomer: false });
  revalidate();
  return { ok: true, message: `Marked ${APPOINTMENT_STATUS_LABELS[result.status].toLowerCase()}.` };
}

/** US-F2: move to another time; the customer gets an updated invite. */
export async function rescheduleAppointmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = adminRescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const result = await rescheduleAppointment(prisma, parsed.data, new Date(), bookingConfig());
  if (!result.ok) return failure(result);
  notifyAppointment(result.appointmentId, "RESCHEDULED", { byCustomer: false });
  revalidate();
  return { ok: true, message: "Moved. The customer has been emailed an updated invite." };
}

/** Book a fitting, pickup or other appointment for a custom order (confirmed). */
export async function scheduleAppointmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = adminScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const result = await scheduleAppointment(prisma, parsed.data, new Date(), bookingConfig());
  if (!result.ok) return failure(result);
  notifyAppointment(result.appointmentId, "SCHEDULED", { byCustomer: false });
  revalidate();
  return { ok: true, message: "Booked. The customer has been emailed an invite." };
}

export async function saveAppointmentNotesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = adminAppointmentNotesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (!(await saveAppointmentNotes(prisma, parsed.data.appointmentId, parsed.data.adminNotes)))
    return { ok: false, formError: "That appointment no longer exists." };
  revalidate();
  return { ok: true, message: "Notes saved." };
}

/** Weekly booking hours (US-F1 DoD). */
export async function addAvailabilityRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = availabilityRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  await addAvailabilityRule(prisma, parsed.data);
  revalidate();
  return { ok: true, message: "Hours added." };
}

export async function deleteAvailabilityRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success || !(await deleteAvailabilityRule(prisma, id.data)))
    return { ok: false, formError: "Those hours were already removed." };
  revalidate();
  return { ok: true, message: "Hours removed." };
}

/** Blackout dates (US-F1 DoD). Existing appointments that day are reported, not cancelled. */
export async function addBlackoutDateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = blackoutDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const result = await addBlackoutDate(prisma, parsed.data, bookingConfig().timeZone);
  if (!result.ok) return { ok: false, fieldErrors: { date: "That date is already blocked" } };
  revalidate();
  const n = result.activeAppointmentsThatDay;
  return {
    ok: true,
    message:
      n === 0
        ? "Date blocked."
        : `Date blocked. ${n} existing appointment${n === 1 ? " is" : "s are"} still booked that day: move or cancel ${n === 1 ? "it" : "them"} in Appointments.`,
  };
}

export async function deleteBlackoutDateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success || !(await deleteBlackoutDate(prisma, id.data)))
    return { ok: false, formError: "That date was already unblocked." };
  revalidate();
  return { ok: true, message: "Date unblocked." };
}
