import "server-only";

import { env } from "@/lib/env";
import { createPaystackProvider } from "@/lib/payments/paystack";
import type { PaymentProvider, Verification, VerifiedStatus } from "@/lib/payments/types";
import { prisma } from "@/lib/prisma";

/**
 * Which payment provider to use. With PAYSTACK_SECRET_KEY set: Paystack. Without it
 * (development and tests only; production requires the key, see env.schema.ts) a dev
 * gateway at /dev/paystack lets you simulate success or cancellation locally.
 */
export function isDevPaymentsEnabled(): boolean {
  return !env.PAYSTACK_SECRET_KEY && env.NODE_ENV !== "production";
}

const DEV_OUTCOMES: readonly VerifiedStatus[] = ["success", "failed", "abandoned"];

/** Dev gateway: the decision made on /dev/paystack is stored on the pending payment. */
const devProvider: PaymentProvider = {
  name: "dev",
  async initialize({ reference }) {
    return { authorizationUrl: `/dev/paystack?reference=${encodeURIComponent(reference)}` };
  },
  async verify(reference): Promise<Verification> {
    const payment = await prisma.payment.findUnique({
      where: { paystackReference: reference },
      select: { status: true, amountKobo: true, currency: true, rawEvent: true },
    });
    const decision = (payment?.rawEvent as { devOutcome?: VerifiedStatus } | null)?.devOutcome;
    const status: VerifiedStatus =
      payment?.status === "SUCCESS"
        ? "success"
        : decision && DEV_OUTCOMES.includes(decision)
          ? decision
          : "pending";
    return {
      status,
      amountKobo: payment?.amountKobo ?? 0,
      currency: payment?.currency ?? "NGN",
      paidAt: status === "success" ? new Date() : null,
      raw: { provider: "dev", decision: decision ?? null },
    };
  },
};

export function getPaymentProvider(): PaymentProvider {
  if (env.PAYSTACK_SECRET_KEY) return createPaystackProvider(env.PAYSTACK_SECRET_KEY);
  if (isDevPaymentsEnabled()) return devProvider;
  throw new Error("PAYSTACK_SECRET_KEY is required in production.");
}

/** Absolute URL Paystack sends the customer back to. */
export function paymentCallbackUrl(): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/api/payments/callback`;
}
