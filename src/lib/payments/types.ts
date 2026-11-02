/**
 * Payment provider abstraction (PRD §9: Paystack behind a PaymentProvider interface).
 * Amounts are integer kobo; currency is NGN (D-8).
 */

export type VerifiedStatus = "success" | "failed" | "abandoned" | "pending";

export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface Verification {
  status: VerifiedStatus;
  amountKobo: number;
  currency: string;
  paidAt: Date | null;
  /** Provider response, stored on the Payment row for audit. */
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: "paystack" | "dev";
  initialize(input: InitializeInput): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<Verification>;
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
