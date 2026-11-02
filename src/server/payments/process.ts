import "server-only";

import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { PaymentProviderError } from "@/lib/payments/types";
import { type FinalizeResult, finalizePayment } from "@/server/data/checkout";

import { notifyPaymentOutcome } from "./notify";
import { getPaymentProvider } from "./provider";
import { PRODUCTS_TAG, productTag } from "@/server/loaders/products";

/**
 * Shared by the browser callback and the webhook: always re-verify with the provider
 * (never trust the redirect or webhook body alone), then apply idempotently and send
 * emails only for the call that actually changed something.
 */
export async function processPaymentReference(reference: string): Promise<FinalizeResult> {
  let verification;
  try {
    verification = await getPaymentProvider().verify(reference);
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      console.error("[payments] verify failed:", error.message);
      const payment = await prisma.payment.findUnique({
        where: { paystackReference: reference },
        select: { kind: true, orderId: true, customOrderId: true },
      });
      return payment ? { outcome: "PENDING", ...payment } : { outcome: "UNKNOWN_REFERENCE" };
    }
    throw error;
  }
  const result = await finalizePayment(prisma, reference, verification);
  if (result.outcome === "RTW_PAID" && result.orderId) {
    // The piece's stock changed: drop cached shop/product reads immediately so a sold
    // 1-of-1 never shows as available (expire: 0, not stale-while-revalidate).
    const order = await prisma.order.findUnique({
      where: { id: result.orderId },
      select: { product: { select: { slug: true } } },
    });
    revalidateTag(PRODUCTS_TAG, { expire: 0 });
    if (order) revalidateTag(productTag(order.product.slug), { expire: 0 });
  }
  if (!["ALREADY_PROCESSED", "PENDING", "UNKNOWN_REFERENCE", "FAILED"].includes(result.outcome)) {
    notifyPaymentOutcome(result, reference);
  }
  return result;
}

/** Where the customer lands after a payment attempt, with a `payment=` state for the banner. */
export function paymentReturnPath(result: FinalizeResult): string {
  const state =
    result.outcome === "PENDING"
      ? "pending"
      : ["FAILED", "AMOUNT_MISMATCH", "RTW_PAID_UNAVAILABLE", "UNKNOWN_REFERENCE"].includes(
            result.outcome,
          )
        ? "failed"
        : "success";
  if (result.orderId)
    return `/checkout/success?order=${encodeURIComponent(result.orderId)}&payment=${state}`;
  if (result.customOrderId)
    return `/account/wardrobe/${encodeURIComponent(result.customOrderId)}?payment=${state}`;
  return "/account/wardrobe";
}
