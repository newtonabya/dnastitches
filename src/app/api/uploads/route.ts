import { NextResponse } from "next/server";

/** Vercel Blob client-upload token route (US-B1, US-C3). Not implemented yet. */
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
