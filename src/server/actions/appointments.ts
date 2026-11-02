"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  appointmentIdSchema,
  bookingSchema,
  customerRescheduleSchema,
} from "@/lib/validators/appointments";
import { fieldErrors } from "@/lib/validators/fields";
import {
  bookConsultation,
  cancelOwnAppointment,
  rescheduleOwnAppointment,
} from "@/server/data/appointments";
import { notifyAppointment } from "@/server/notifications/appointments";
import { bookingConfig } from "@/server/scheduling-config";

import type { ActionResult } from "./types";

const SIGN_IN = "Please sign in to book an appointment.";
const SLOT_GONE =
  "Sorry, that time was just taken or is no longer available. Please choose another.";
const TOO_LATE =
  "Appointments can only be changed up to 24 hours before they start. Please contact us instead.";

function revalidateAppointments() {
  revalidatePath("/account/appointments");
  revalidatePath("/custom/book");
  revalidatePath("/admin/appointments");
}

/** US-F1 AC2–AC4: book a consultation slot. */
export async function bookConsultationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: SIGN_IN };
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await bookConsultation(
    prisma,
    session.user.id,
    parsed.data,
    new Date(),
    bookingConfig(),
  );
  if (!result.ok) {
    return result.code === "ORDER_NOT_FOUND"
      ? { ok: false, fieldErrors: { customOrderId: "Choose one of your open requests" } }
      : { ok: false, formError: SLOT_GONE, fieldErrors: { startsAt: SLOT_GONE } };
  }
  notifyAppointment(result.appointmentId, "BOOKED", { byCustomer: true });
  revalidateAppointments();
  redirect("/account/appointments?booked=1");
}

/** US-F1 AC5: move my consultation to another free slot. */
export async function rescheduleOwnAppointmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: SIGN_IN };
  const parsed = customerRescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await rescheduleOwnAppointment(
    prisma,
    session.user.id,
    parsed.data,
    new Date(),
    bookingConfig(),
  );
  if (!result.ok) {
    const formError = {
      NOT_FOUND: "We couldn't find that appointment.",
      TOO_LATE,
      SLOT_UNAVAILABLE: SLOT_GONE,
      NOT_RESCHEDULABLE: "Please contact us to move this appointment.",
    }[result.code];
    return { ok: false, formError };
  }
  notifyAppointment(parsed.data.appointmentId, "RESCHEDULED", { byCustomer: true });
  revalidateAppointments();
  redirect("/account/appointments?moved=1");
}

/** US-F1 AC5: cancel my appointment. */
export async function cancelOwnAppointmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: SIGN_IN };
  const parsed = appointmentIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, formError: "We couldn't find that appointment." };

  const result = await cancelOwnAppointment(
    prisma,
    session.user.id,
    parsed.data.appointmentId,
    new Date(),
  );
  if (!result.ok)
    return {
      ok: false,
      formError: result.code === "NOT_FOUND" ? "We couldn't find that appointment." : TOO_LATE,
    };
  notifyAppointment(parsed.data.appointmentId, "CANCELLED", { byCustomer: true });
  revalidateAppointments();
  // Redirect so the confirmation survives the card moving to "Past and cancelled".
  redirect("/account/appointments?cancelled=1");
}
