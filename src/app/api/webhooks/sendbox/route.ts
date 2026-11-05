import { NextResponse } from "next/server";

import { isValidCourierWebhookToken } from "@/lib/courier/webhook-token";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getCourierProvider } from "@/server/courier";
import { findShipmentByTrackingCode, refreshShipment } from "@/server/data/shipments";
import { sendShippingEmailNow } from "@/server/notifications/shipping";

/**
 * Sendbox tracking webhook (v1.2, US-D5; the callback_url we give when booking).
 *
 * Sendbox doesn't document its webhook payload or a signature, so nothing in the body is
 * trusted (D-25): we only read a tracking code from it, then fetch that shipment's real
 * status from Sendbox's tracking API. The token in the URL keeps strangers from making us
 * poll. Always answers 200 for a valid token, so Sendbox doesn't retry endlessly.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!isValidCourierWebhookToken(token, env.AUTH_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = getCourierProvider();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = trackingCodeFrom(body);
  if (!provider || !code) return NextResponse.json({ received: true });

  const shipment = await findShipmentByTrackingCode(prisma, code);
  if (!shipment) return NextResponse.json({ received: true });
  try {
    const applied = await refreshShipment(prisma, provider, shipment.id, new Date());
    if (applied?.becameDelivered) await sendShippingEmailNow(applied.shipmentId, "DELIVERED");
  } catch (error) {
    // The polling job will pick it up.
    console.error(
      "[courier] Webhook refresh failed:",
      error instanceof Error ? error.message : error,
    );
  }
  return NextResponse.json({ received: true });
}

/** A tracking code from wherever Sendbox puts it: top level or under data/shipment. */
function trackingCodeFrom(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  const candidates = [body, body.data, body.shipment].filter(
    (v): v is Record<string, unknown> => typeof v === "object" && v !== null,
  );
  for (const c of candidates) {
    for (const key of ["tracking_code", "code"]) {
      const v = c[key];
      if (typeof v === "string" && /^[\w-]{4,64}$/.test(v)) return v;
    }
  }
  return null;
}
