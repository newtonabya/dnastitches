import { randomUUID } from "node:crypto";

import type { PaymentKind } from "@/generated/prisma/enums";

const PREFIX: Record<PaymentKind, string> = {
  RTW_FULL: "rtw",
  CUSTOM_DEPOSIT: "dep",
  CUSTOM_BALANCE: "bal",
};

/** A unique Paystack transaction reference, e.g. `dna-dep-3f2c…`. Paystack allows [a-z0-9.=-]. */
export function newPaymentReference(kind: PaymentKind): string {
  return `dna-${PREFIX[kind]}-${randomUUID()}`;
}

export const PAYMENT_REFERENCE_RE = /^dna-(rtw|dep|bal)-[0-9a-f-]{36}$/;
