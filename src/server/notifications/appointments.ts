import "server-only";

import { after } from "next/server";

import {
  type AppointmentEvent,
  customerAppointmentEmail,
  ownerAppointmentEmail,
} from "@/emails/appointments";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getAppointmentEmailData } from "@/server/data/appointments";

/**
 * After the response: email the customer (always) and, for changes the customer made,
 * the owner, each with an .ics invite (US-F1 AC4).
 */
export function notifyAppointment(
  appointmentId: string,
  event: AppointmentEvent,
  { byCustomer }: { byCustomer: boolean },
) {
  after(async () => {
    const a = await getAppointmentEmailData(prisma, appointmentId);
    if (!a) return;
    const data = {
      ...a,
      customerName: a.user.name,
      customerEmail: a.user.email,
      orderLabel: a.customOrder ? `${a.customOrder.title} (${a.customOrder.reference})` : null,
      timeZone: env.STUDIO_TIMEZONE,
      studioAddress: env.STUDIO_ADDRESS ?? null,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
    };
    await sendEmail(customerAppointmentEmail(event, data));
    if (
      byCustomer &&
      env.ADMIN_EMAILS.length > 0 &&
      (event === "BOOKED" || event === "RESCHEDULED" || event === "CANCELLED")
    )
      await sendEmail(ownerAppointmentEmail(env.ADMIN_EMAILS, event, data));
  });
}
