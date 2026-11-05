import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getCourierProvider } from "@/server/courier";
import { refreshOpenShipments } from "@/server/data/shipments";
import { sendShippingEmailNow } from "@/server/notifications/shipping";

/**
 * Courier tracking (v1.2, US-D5): asks the courier for the latest on open shipments and
 * applies it; a delivered parcel fulfils its order and emails the customer once. Called
 * every 15 minutes by the scheduled GitHub Actions workflow (reminders.yml), with
 * `Authorization: Bearer $CRON_SECRET`. The Sendbox webhook makes updates quicker, but
 * this keeps tracking right even if a webhook is lost.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = getCourierProvider();
  if (!provider) return NextResponse.json({ checked: 0, skipped: "no courier configured" });
  const result = await refreshOpenShipments(prisma, provider, new Date());
  for (const d of result.delivered) await sendShippingEmailNow(d.shipmentId, "DELIVERED");
  return NextResponse.json({
    checked: result.checked,
    updated: result.updated,
    delivered: result.delivered.length,
    failed: result.failed,
  });
}

export const POST = GET;
