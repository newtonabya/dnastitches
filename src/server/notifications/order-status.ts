import "server-only";

import { after } from "next/server";

import { statusChangeEmail } from "@/emails/order-status";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStatusEmailData } from "@/server/data/admin/orders";

/** After the response, email the customer about the order's current status if it's one that notifies (US-C1 AC6). */
export function notifyCustomerOfStatus(orderId: string) {
  after(async () => {
    const data = await getStatusEmailData(prisma, orderId);
    if (!data) return;
    const email = statusChangeEmail({ ...data, siteUrl: env.NEXT_PUBLIC_SITE_URL });
    if (email) await sendEmail(email);
  });
}
