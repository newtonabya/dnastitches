import "server-only";

import { after } from "next/server";

import { repairReportedOwnerEmail, repairStatusEmail } from "@/emails/repairs";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getRepairEmailData } from "@/server/data/repairs";

/** After the response: email the customer (always) and the owner (new reports only). */
export function notifyRepair(repairId: string, { reported }: { reported: boolean }) {
  after(async () => {
    const data = await getRepairEmailData(prisma, repairId);
    if (!data) return;
    const d = { ...data, siteUrl: env.NEXT_PUBLIC_SITE_URL };
    await sendEmail(repairStatusEmail(d));
    if (reported && env.ADMIN_EMAILS.length > 0)
      await sendEmail(repairReportedOwnerEmail(env.ADMIN_EMAILS, d));
  });
}
