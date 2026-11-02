import { type NextRequest, NextResponse } from "next/server";

import { PAYMENT_REFERENCE_RE } from "@/lib/payments/reference";
import { paymentReturnPath, processPaymentReference } from "@/server/payments/process";

/**
 * Where Paystack (or the dev gateway) sends the customer after paying. Re-verifies
 * the transaction server-side, applies it, then redirects to the right page.
 * A Route Handler because it's a redirect target for the payment provider.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  if (!PAYMENT_REFERENCE_RE.test(reference))
    return NextResponse.redirect(new URL("/account/wardrobe", request.url));

  const result = await processPaymentReference(reference);
  return NextResponse.redirect(new URL(paymentReturnPath(result), request.url));
}
