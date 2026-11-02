"use server";

import { after } from "next/server";

import { customerConfirmationEmail, ownerNotificationEmail } from "@/emails/custom-request";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { makeCustomOrderRequestSchema } from "@/lib/validators/custom-order";
import { fieldErrors } from "@/lib/validators/fields";
import { createCustomOrderRequest } from "@/server/data/custom-orders";

import type { ActionResult } from "./types";

/**
 * US-B1: submit a custom request. Checks the session, re-validates with the same Zod
 * schema the form uses, creates the order (and any new measurement profile) in one
 * transaction, then emails the customer and the owner after responding.
 */
export async function submitCustomOrder(
  input: unknown,
): Promise<ActionResult<{ reference: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: "Please sign in to submit your request." };

  const schema = makeCustomOrderRequestSchema({
    now: () => new Date(),
    minLeadTimeDays: env.MIN_LEAD_TIME_DAYS,
    timeZone: env.STUDIO_TIMEZONE,
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await createCustomOrderRequest(prisma, session.user.id, parsed.data);
  if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  if (user) {
    const data = {
      reference: result.reference,
      title: parsed.data.design.title,
      customerName: user.name,
      customerEmail: user.email,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
    };
    after(async () => {
      await sendEmail(customerConfirmationEmail(data));
      if (env.ADMIN_EMAILS.length > 0)
        await sendEmail(ownerNotificationEmail(data, env.ADMIN_EMAILS));
    });
  }

  return { ok: true, data: { reference: result.reference } };
}
