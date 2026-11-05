import { NextResponse } from "next/server";

import { reminderEmail } from "@/emails/reminders";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getEmailSender } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { reminderSms } from "@/lib/sms/messages";
import { runDueReminders } from "@/server/data/reminders";
import { getSmsProvider } from "@/server/sms";

/**
 * Sends due fitting and pickup reminders: email (US-G1) and, for customers who opted in,
 * SMS/WhatsApp (v1.2, US-G2). Called every 15 minutes by the scheduled GitHub Actions
 * workflow (.github/workflows/reminders.yml) or Vercel Cron, with
 * `Authorization: Bearer $CRON_SECRET`. Safe to call any number of times: each reminder
 * is claimed before sending, so it goes out at most once (AC3). Overdue reminders are
 * caught up on the next run.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = getEmailSender();
  const sms = getSmsProvider();
  const result = await runDueReminders(
    prisma,
    new Date(),
    // Each send throws on failure, so the attempt is recorded and retried (AC4).
    async ({ channel, appointment }) => {
      if (channel === "SMS") {
        await sms!.send({
          to: appointment.customerPhone!,
          text: reminderSms({
            type: appointment.type,
            startsAt: appointment.startsAt,
            timeZone: env.STUDIO_TIMEZONE,
            siteUrl: env.NEXT_PUBLIC_SITE_URL,
          }),
        });
        return;
      }
      await email.send(
        reminderEmail({
          ...appointment,
          timeZone: env.STUDIO_TIMEZONE,
          studioAddress: env.STUDIO_ADDRESS ?? null,
          siteUrl: env.NEXT_PUBLIC_SITE_URL,
        }),
      );
    },
    50,
    { smsEnabled: sms !== null },
  );
  return NextResponse.json(result);
}

/** Some schedulers can only POST; behave the same. */
export const POST = GET;
