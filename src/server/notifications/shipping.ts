import "server-only";

import { after } from "next/server";

import { shipmentBookedEmail, shipmentDeliveredEmail } from "@/emails/shipping";
import { getEmailSender } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getShipmentEmailData } from "@/server/data/shipments";

/** After the response, email the customer that the courier is booked, or has delivered. */
export function sendShippingEmail(shipmentId: string, kind: "BOOKED" | "DELIVERED") {
  after(() => sendShippingEmailNow(shipmentId, kind));
}

/** For jobs that run outside a request (the tracking cron). Never throws. */
export async function sendShippingEmailNow(shipmentId: string, kind: "BOOKED" | "DELIVERED") {
  try {
    const data = await getShipmentEmailData(prisma, shipmentId);
    if (!data) return;
    const input = { ...data, wardrobeUrl: `${env.NEXT_PUBLIC_SITE_URL}${data.wardrobePath}` };
    await getEmailSender().send(
      kind === "BOOKED" ? shipmentBookedEmail(input) : shipmentDeliveredEmail(input),
    );
  } catch (error) {
    // Logged without the address (NFR-3).
    console.error(
      `[courier] ${kind} email failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}
