import { NextResponse } from "next/server";

import { env } from "@/lib/env";

/** Vercel Cron reminder job (US-G1, v1.1). Protected by CRON_SECRET. Not implemented yet. */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
