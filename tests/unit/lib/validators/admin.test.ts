import {
  adminNotesSchema,
  offlinePaymentSchema,
  quoteSchema,
  transitionSchema,
} from "@/lib/validators/admin";
import { fieldErrors } from "@/lib/validators/fields";

describe("transitionSchema (US-C1)", () => {
  it("parses status, optional note, expectedFrom and the forfeit checkbox", () => {
    expect(
      transitionSchema.parse({
        orderId: "o1",
        to: "FITTING",
        expectedFrom: "IN_PRODUCTION",
        note: " ",
        confirmForfeit: "on",
      }),
    ).toEqual({
      orderId: "o1",
      to: "FITTING",
      expectedFrom: "IN_PRODUCTION",
      note: undefined,
      confirmForfeit: true,
    });
    expect(
      transitionSchema.parse({ orderId: "o1", to: "FITTING", expectedFrom: "" }),
    ).toMatchObject({ expectedFrom: undefined, confirmForfeit: false });
  });

  it("rejects unknown statuses", () => {
    const r = transitionSchema.safeParse({ orderId: "o1", to: "SHIPPED" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).to).toBe("Choose a status");
  });
});

describe("quoteSchema (US-C4 AC1)", () => {
  it("converts naira (with commas) to kobo; an empty delivery fee is ₦0", () => {
    expect(
      quoteSchema.parse({
        orderId: "o1",
        quotedPriceNaira: "250,000",
        depositNaira: "125000.50",
        deliveryFeeNaira: "",
      }),
    ).toEqual({
      orderId: "o1",
      quotedPriceKobo: 25_000_000,
      depositKobo: 12_500_050,
      deliveryFeeKobo: 0,
    });
    expect(
      quoteSchema.parse({ orderId: "o1", quotedPriceNaira: 100, depositNaira: 50 }).deliveryFeeKobo,
    ).toBe(0);
  });

  it.each([
    [{ quotedPriceNaira: "" }, "quotedPriceNaira", "Quoted price is required"],
    [{ quotedPriceNaira: "abc" }, "quotedPriceNaira", "Quoted price must be a number"],
    [{ depositNaira: "0" }, "depositNaira", "Deposit must be more than ₦0"],
    [{ deliveryFeeNaira: "-5" }, "deliveryFeeNaira", "Delivery fee can't be negative"],
    [{ quotedPriceNaira: "200000000" }, "quotedPriceNaira", "Quoted price looks too high"],
    [{ depositNaira: "600" }, "depositNaira", "Deposit can't be more than the total"],
  ])("rejects %j", (patch, field, message) => {
    const r = quoteSchema.safeParse({
      orderId: "o1",
      quotedPriceNaira: "500",
      depositNaira: "250",
      deliveryFeeNaira: "50",
      ...patch,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)[field]).toBe(message);
  });
});

describe("offlinePaymentSchema (US-C4 AC5)", () => {
  it("parses deposit/balance and amount in kobo", () => {
    expect(
      offlinePaymentSchema.parse({
        orderId: "o1",
        kind: "CUSTOM_BALANCE",
        amountNaira: "1,500",
        note: "Transfer",
      }),
    ).toEqual({
      orderId: "o1",
      kind: "CUSTOM_BALANCE",
      amountKobo: 150_000,
      note: "Transfer",
    });
  });

  it("rejects RTW payments and non-positive amounts", () => {
    expect(
      offlinePaymentSchema.safeParse({ orderId: "o1", kind: "RTW_FULL", amountNaira: "1" }).success,
    ).toBe(false);
    expect(
      offlinePaymentSchema.safeParse({ orderId: "o1", kind: "CUSTOM_DEPOSIT", amountNaira: "0" })
        .success,
    ).toBe(false);
  });
});

describe("adminNotesSchema", () => {
  it("defaults to empty and caps length", () => {
    expect(adminNotesSchema.parse({ orderId: "o1" })).toEqual({ orderId: "o1", adminNotes: "" });
    expect(
      adminNotesSchema.safeParse({ orderId: "o1", adminNotes: "x".repeat(5001) }).success,
    ).toBe(false);
  });
});
