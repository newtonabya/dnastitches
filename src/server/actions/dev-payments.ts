"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { PAYMENT_REFERENCE_RE } from "@/lib/payments/reference";
import { prisma } from "@/lib/prisma";
import { paymentReturnPath, processPaymentReference } from "@/server/payments/process";
import { isDevPaymentsEnabled } from "@/server/payments/provider";

/**
 * Dev gateway only (no PAYSTACK_SECRET_KEY, never in production): record the
 * simulated outcome on the pending payment, then verify and finalise it exactly as the
 * Paystack callback does. (Redirecting to the callback Route Handler from a Server Action
 * would leave its URL in the address bar.)
 */
export async function devDecidePaymentAction(formData: FormData) {
  if (!isDevPaymentsEnabled()) throw new Error("The dev payment gateway is disabled.");
  const input = z
    .object({
      reference: z.string().regex(PAYMENT_REFERENCE_RE),
      outcome: z.enum(["success", "abandoned"]),
    })
    .parse(Object.fromEntries(formData));
  await prisma.payment.updateMany({
    where: { paystackReference: input.reference, status: "PENDING" },
    data: { rawEvent: { devOutcome: input.outcome } },
  });
  redirect(paymentReturnPath(await processPaymentReference(input.reference)));
}
