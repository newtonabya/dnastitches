import { NextResponse } from "next/server";

/**
 * Paystack webhook (US-A4, US-C4). Not implemented yet.
 * Must verify `x-paystack-signature` (HMAC-SHA512 with PAYSTACK_SECRET_KEY),
 * re-verify via the Verify Transaction API, and be idempotent on paystackReference.
 */
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
