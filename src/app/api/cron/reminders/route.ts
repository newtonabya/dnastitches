import { NextResponse } from "next/server";

import { reminderEmail } from "@/emails/reminders";
import { getEmailSender } from "@/lib/email";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { runDueReminders } from "@/server/data/reminders";

/**
 * Sends due fitting and pickup reminders (US-G1). Called every 15 minutes by the
 * scheduled GitHub Actions workflow (.github/workflows/reminders.yml) or Vercel Cron,
 * with `Authorization: Bearer $CRON_SECRET`. Safe to call any number of times: each
 * reminder is claimed before sending, so it goes out at most once (AC3). Overdue
 * reminders are caught up on the next run.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sender = getEmailSender();
  const result = await runDueReminders(prisma, new Date(), async ({ appointment }) => {
    // Throws on failure, so the attempt is recorded and retried (AC4).
    await sender.send(
      reminderEmail({
        ...appointment,
        timeZone: env.STUDIO_TIMEZONE,
        studioAddress: env.STUDIO_ADDRESS ?? null,
        siteUrl: env.NEXT_PUBLIC_SITE_URL,
      }),
    );
  });
  return NextResponse.json(result);
}

/** Some schedulers can only POST; behave the same. */
export const POST = GET;
