"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validators/fields";
import { checkoutSchema, customPaymentSchema } from "@/lib/validators/payments";
import {
  cancelPendingOrder,
  expireStaleOrders,
  reserveRtwOrder,
  startCustomOrderPayment,
} from "@/server/data/checkout";
import { quoteCheckoutDelivery } from "@/server/courier";
import { getPaymentProvider, paymentCallbackUrl } from "@/server/payments/provider";

import type { ActionResult } from "./types";

const PROVIDER_DOWN = "We couldn't reach the payment provider. Please try again in a moment.";

/**
 * US-A4: start checkout. Validates (incl. the final-sale acknowledgement, AC3),
 * holds the piece for 15 minutes, creates the pending order + payment, then sends
 * the customer to Paystack. If the piece was just claimed, says so (AC5).
 */
export async function startCheckoutAction(
  _prev: ActionResult<{ code?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ code?: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: "Please sign in to buy this piece." };
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  await expireStaleOrders(prisma, new Date(), parsed.data.productId);
  const reserved = await reserveRtwOrder(prisma, {
    userId: session.user.id,
    ...parsed.data,
    courierQuote: await courierQuoteFor(session.user.id, parsed.data),
  });
  if (!reserved.ok)
    return { ok: false, formError: reserved.message, fieldErrors: { code: reserved.code } };

  let authorizationUrl: string;
  try {
    ({ authorizationUrl } = await getPaymentProvider().initialize({
      email: reserved.email,
      amountKobo: reserved.amountKobo,
      reference: reserved.reference,
      callbackUrl: paymentCallbackUrl(),
      metadata: { orderId: reserved.orderId, kind: "RTW_FULL" },
    }));
  } catch (error) {
    console.error("[checkout] initialize failed:", error instanceof Error ? error.message : error);
    await cancelPendingOrder(prisma, reserved.orderId);
    return { ok: false, formError: PROVIDER_DOWN };
  }
  redirect(authorizationUrl);
}

/**
 * The courier's live price for the chosen address (US-D5), the same cached quote the
 * checkout page showed. Fetched here, outside the reservation transaction, because it's
 * a network call; null means the zone fee applies.
 */
async function courierQuoteFor(
  userId: string,
  input: { productId: string; fulfillmentMethod: string; addressId?: string },
) {
  if (input.fulfillmentMethod !== "DELIVERY" || !input.addressId) return null;
  const [address, product] = await Promise.all([
    prisma.address.findFirst({
      where: { id: input.addressId, userId },
      select: { line1: true, city: true, state: true },
    }),
    prisma.product.findUnique({
      where: { id: input.productId },
      select: { priceKobo: true, name: true },
    }),
  ]);
  if (!address || !product) return null;
  return quoteCheckoutDelivery(address, product.priceKobo, product.name);
}

/** US-C4 AC2/AC4: pay a custom order's deposit or balance online. */
export async function startCustomPaymentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: "Please sign in again." };
  const parsed = customPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const started = await startCustomOrderPayment(prisma, {
    userId: session.user.id,
    orderId: parsed.data.orderId,
    kind: parsed.data.kind,
  });
  if (!started.ok) return { ok: false, formError: started.message };

  let authorizationUrl: string;
  try {
    ({ authorizationUrl } = await getPaymentProvider().initialize({
      email: started.email,
      amountKobo: started.amountKobo,
      reference: started.reference,
      callbackUrl: paymentCallbackUrl(),
      metadata: { customOrderId: parsed.data.orderId, kind: parsed.data.kind },
    }));
  } catch (error) {
    console.error("[payments] initialize failed:", error instanceof Error ? error.message : error);
    await prisma.payment.updateMany({
      where: { paystackReference: started.reference, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return { ok: false, formError: PROVIDER_DOWN };
  }
  redirect(authorizationUrl);
}
