import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { expireStaleOrders } from "@/server/data/checkout";

/**
 * Cancels pending checkouts older than 15 minutes (US-A4 AC7). Holds already stop
 * counting after 15 minutes on their own; this tidies the order and payment rows.
 * Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cancelled = await expireStaleOrders(prisma);
  return NextResponse.json({ cancelled });
}
