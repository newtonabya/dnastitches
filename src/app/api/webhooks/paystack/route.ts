import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { PAYMENT_REFERENCE_RE } from "@/lib/payments/reference";
import { isValidPaystackSignature } from "@/lib/payments/signature";
import { processPaymentReference } from "@/server/payments/process";

/**
 * Paystack webhook (US-A4 DoD, US-C4). Verifies the `x-paystack-signature`
 * HMAC-SHA512 of the raw body, then re-verifies the transaction with the Verify API
 * before applying it. Idempotent on the payment reference: the same event twice
 * results in one payment. Unknown events and references are acknowledged and ignored.
 */
export async function POST(request: Request) {
  if (!env.PAYSTACK_SECRET_KEY)
    return NextResponse.json({ error: "Payments aren't configured." }, { status: 503 });

  const rawBody = await request.text();
  if (
    !isValidPaystackSignature(
      rawBody,
      request.headers.get("x-paystack-signature"),
      env.PAYSTACK_SECRET_KEY,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference = event.data?.reference;
  if (event.event === "charge.success" && reference && PAYMENT_REFERENCE_RE.test(reference)) {
    const result = await processPaymentReference(reference);
    return NextResponse.json({ received: true, outcome: result.outcome });
  }
  return NextResponse.json({ received: true });
}
