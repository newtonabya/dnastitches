/** @jest-environment node */
import {
  availableToReserve,
  isReservationActive,
  reservationCutoff,
  RESERVATION_MINUTES,
} from "@/lib/checkout";
import { createPaystackProvider, mapPaystackStatus } from "@/lib/payments/paystack";
import { PAYMENT_REFERENCE_RE, newPaymentReference } from "@/lib/payments/reference";
import { isValidPaystackSignature, signPaystackBody } from "@/lib/payments/signature";
import { PaymentProviderError } from "@/lib/payments/types";
import {
  checkoutSchema,
  customPaymentSchema,
  DEPOSIT_TERMS_MESSAGE,
  FINAL_SALE_MESSAGE,
} from "@/lib/validators/payments";
import { fieldErrors } from "@/lib/validators/fields";

describe("Paystack signature (US-A4 DoD)", () => {
  const secret = "sk_test_secret";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });

  it("accepts the HMAC-SHA512 of the raw body", () => {
    expect(isValidPaystackSignature(body, signPaystackBody(body, secret), secret)).toBe(true);
  });

  it.each([
    ["wrong secret", signPaystackBody(body, "sk_test_other")],
    ["tampered body", signPaystackBody(body + " ", secret)],
    ["missing", null],
    ["not hex", "z".repeat(128)],
    ["too short", "ab"],
  ])("rejects %s", (_, signature) => {
    expect(isValidPaystackSignature(body, signature, secret)).toBe(false);
  });
});

describe("Paystack provider", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("initializes a transaction in kobo/NGN with the reference and callback", async () => {
    const fetchMock = jest.fn(async () =>
      json(200, {
        status: true,
        message: "ok",
        data: { authorization_url: "https://checkout.paystack.com/abc" },
      }),
    );
    const provider = createPaystackProvider("sk_test_1", fetchMock as unknown as typeof fetch);
    const result = await provider.initialize({
      email: "ada@example.com",
      amountKobo: 15_000_000,
      reference: "dna-rtw-1",
      callbackUrl: "https://dna.example/api/payments/callback",
      metadata: { orderId: "o1" },
    });
    expect(result).toEqual({ authorizationUrl: "https://checkout.paystack.com/abc" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk_test_1" });
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ada@example.com",
      amount: 15_000_000,
      currency: "NGN",
      reference: "dna-rtw-1",
      callback_url: "https://dna.example/api/payments/callback",
      metadata: { orderId: "o1" },
    });
  });

  it("verifies a transaction and maps its status", async () => {
    const fetchMock = jest.fn(async () =>
      json(200, {
        status: true,
        message: "ok",
        data: {
          status: "success",
          amount: 500,
          currency: "NGN",
          paid_at: "2026-11-02T10:00:00.000Z",
        },
      }),
    );
    const provider = createPaystackProvider("sk", fetchMock as unknown as typeof fetch);
    expect(await provider.verify("ref/1")).toMatchObject({
      status: "success",
      amountKobo: 500,
      currency: "NGN",
      paidAt: new Date("2026-11-02T10:00:00.000Z"),
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.paystack.co/transaction/verify/ref%2F1",
    );
  });

  it("throws a PaymentProviderError on API errors", async () => {
    const provider = createPaystackProvider("sk", (async () =>
      json(400, { status: false, message: "Invalid key" })) as unknown as typeof fetch);
    await expect(provider.verify("x")).rejects.toThrow(PaymentProviderError);
    await expect(provider.verify("x")).rejects.toThrow(/Invalid key/);
  });

  it.each([
    ["success", "success"],
    ["failed", "failed"],
    ["reversed", "failed"],
    ["abandoned", "abandoned"],
    ["ongoing", "pending"],
    [undefined, "pending"],
  ])("maps %p → %p", (input, expected) => {
    expect(mapPaystackStatus(input)).toBe(expected);
  });
});

describe("references and reservations", () => {
  it("generates unique references per kind", () => {
    const a = newPaymentReference("RTW_FULL");
    expect(a).toMatch(PAYMENT_REFERENCE_RE);
    expect(a.startsWith("dna-rtw-")).toBe(true);
    expect(newPaymentReference("CUSTOM_DEPOSIT").startsWith("dna-dep-")).toBe(true);
    expect(newPaymentReference("CUSTOM_BALANCE")).not.toBe(newPaymentReference("CUSTOM_BALANCE"));
  });

  it("holds a reservation for exactly 15 minutes (US-A4 AC7)", () => {
    const now = new Date("2026-11-02T10:15:00Z");
    expect(RESERVATION_MINUTES).toBe(15);
    expect(reservationCutoff(now).toISOString()).toBe("2026-11-02T10:00:00.000Z");
    expect(isReservationActive(new Date("2026-11-02T10:00:00Z"), now)).toBe(true);
    expect(isReservationActive(new Date("2026-11-02T09:59:59Z"), now)).toBe(false);
    expect(availableToReserve(1, 1)).toBe(0);
    expect(availableToReserve(3, 1)).toBe(2);
    expect(availableToReserve(0, 2)).toBe(0);
  });
});

describe("checkoutSchema (US-A4)", () => {
  const base = { productId: "p1", fulfillmentMethod: "PICKUP", finalSaleAcknowledged: "on" };

  it("rejects checkout without the final-sale acknowledgement (AC3)", () => {
    const r = checkoutSchema.safeParse({ ...base, finalSaleAcknowledged: undefined });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).finalSaleAcknowledged).toBe(FINAL_SALE_MESSAGE);
  });

  it("requires an address for delivery and drops it for pickup", () => {
    const r = checkoutSchema.safeParse({ ...base, fulfillmentMethod: "DELIVERY", addressId: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).addressId).toBe("Choose a delivery address");
    expect(checkoutSchema.parse({ ...base, addressId: "" })).toEqual({
      productId: "p1",
      fulfillmentMethod: "PICKUP",
      finalSaleAcknowledged: true,
    });
  });

  it("customPaymentSchema requires the deposit terms box", () => {
    const r = customPaymentSchema.safeParse({ orderId: "o1", kind: "CUSTOM_DEPOSIT" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).termsAcknowledged).toBe(DEPOSIT_TERMS_MESSAGE);
    expect(
      customPaymentSchema.parse({ orderId: "o1", kind: "CUSTOM_BALANCE", termsAcknowledged: "on" })
        .kind,
    ).toBe("CUSTOM_BALANCE");
    expect(
      customPaymentSchema.safeParse({ orderId: "o1", kind: "RTW_FULL", termsAcknowledged: "on" })
        .success,
    ).toBe(false);
  });
});
