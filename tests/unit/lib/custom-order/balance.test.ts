import {
  buildTransitionContext,
  cancellationForfeitsDeposit,
  computeBalance,
  defaultOfflinePaymentKind,
  type PaymentLike,
} from "@/lib/custom-order/balance";

const quote = { quotedPriceKobo: 250_000_00, depositKobo: 125_000_00, deliveryFeeKobo: 5_000_00 };
const pay = (
  kind: PaymentLike["kind"],
  amountKobo: number,
  status: PaymentLike["status"] = "SUCCESS",
): PaymentLike => ({
  kind,
  amountKobo,
  status,
});

describe("computeBalance (US-C4)", () => {
  it("quote + delivery − successful custom payments", () => {
    expect(computeBalance(quote, [pay("CUSTOM_DEPOSIT", 125_000_00)])).toEqual({
      totalDueKobo: 255_000_00,
      paidKobo: 125_000_00,
      balanceDueKobo: 130_000_00,
      hasSuccessfulDeposit: true,
    });
  });

  it("ignores pending/failed/abandoned payments and RTW payments", () => {
    const result = computeBalance(quote, [
      pay("CUSTOM_DEPOSIT", 100, "PENDING"),
      pay("CUSTOM_DEPOSIT", 100, "FAILED"),
      pay("CUSTOM_BALANCE", 100, "ABANDONED"),
      pay("RTW_FULL", 999),
    ]);
    expect(result).toMatchObject({
      paidKobo: 0,
      balanceDueKobo: 255_000_00,
      hasSuccessfulDeposit: false,
    });
  });

  it("is zero when fully paid and negative when overpaid", () => {
    expect(
      computeBalance(quote, [pay("CUSTOM_DEPOSIT", 125_000_00), pay("CUSTOM_BALANCE", 130_000_00)])
        .balanceDueKobo,
    ).toBe(0);
    expect(computeBalance(quote, [pay("CUSTOM_BALANCE", 300_000_00)]).balanceDueKobo).toBe(
      -45_000_00,
    );
  });

  it("treats a missing quote and delivery fee as 0", () => {
    expect(
      computeBalance({ quotedPriceKobo: null, depositKobo: null, deliveryFeeKobo: null }, []),
    ).toEqual({
      totalDueKobo: 0,
      paidKobo: 0,
      balanceDueKobo: 0,
      hasSuccessfulDeposit: false,
    });
  });
});

describe("helpers", () => {
  it("buildTransitionContext", () => {
    expect(buildTransitionContext(quote, [pay("CUSTOM_DEPOSIT", 1)])).toEqual({
      quotedPriceKobo: 250_000_00,
      depositKobo: 125_000_00,
      hasSuccessfulDeposit: true,
      balanceDueKobo: 255_000_00 - 1,
    });
  });

  it("cancellationForfeitsDeposit (US-C1 AC7)", () => {
    expect(cancellationForfeitsDeposit("CANCELLED", [pay("CUSTOM_DEPOSIT", 1)])).toBe(true);
    expect(cancellationForfeitsDeposit("CANCELLED", [pay("CUSTOM_DEPOSIT", 1, "PENDING")])).toBe(
      false,
    );
    expect(cancellationForfeitsDeposit("FITTING", [pay("CUSTOM_DEPOSIT", 1)])).toBe(false);
  });

  it("defaultOfflinePaymentKind", () => {
    expect(defaultOfflinePaymentKind("AWAITING_DEPOSIT")).toBe("CUSTOM_DEPOSIT");
    expect(defaultOfflinePaymentKind("READY")).toBe("CUSTOM_BALANCE");
  });
});
