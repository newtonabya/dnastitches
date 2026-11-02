import {
  type InitializeInput,
  type PaymentProvider,
  PaymentProviderError,
  type Verification,
  type VerifiedStatus,
} from "./types";

/**
 * Paystack implementation (card, bank transfer, USSD; NGN).
 * Docs: https://paystack.com/docs/api/transaction/
 */

const API = "https://api.paystack.co";

type Fetch = typeof fetch;

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

/** Map Paystack transaction statuses onto ours. Anything unfinished counts as pending. */
export function mapPaystackStatus(status: string | undefined): VerifiedStatus {
  switch (status) {
    case "success":
      return "success";
    case "failed":
    case "reversed":
      return "failed";
    case "abandoned":
      return "abandoned";
    default:
      return "pending";
  }
}

export function createPaystackProvider(
  secretKey: string,
  fetchImpl: Fetch = fetch,
): PaymentProvider {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const body = (await response.json().catch(() => null)) as PaystackEnvelope<T> | null;
    if (!response.ok || !body?.status) {
      throw new PaymentProviderError(
        `Paystack ${path.split("/")[2] ?? "request"} failed: ${body?.message ?? response.status}`,
      );
    }
    return body.data;
  }

  return {
    name: "paystack",

    async initialize(input: InitializeInput) {
      const data = await call<{ authorization_url: string }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          currency: "NGN",
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
      });
      return { authorizationUrl: data.authorization_url };
    },

    async verify(reference: string): Promise<Verification> {
      const data = await call<{
        status: string;
        amount: number;
        currency: string;
        paid_at: string | null;
      }>(`/transaction/verify/${encodeURIComponent(reference)}`);
      return {
        status: mapPaystackStatus(data.status),
        amountKobo: data.amount,
        currency: data.currency,
        paidAt: data.paid_at ? new Date(data.paid_at) : null,
        raw: data,
      };
    },
  };
}
