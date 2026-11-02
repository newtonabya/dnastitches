import type { CustomOrderStatus, PaymentKind, PaymentStatus } from "@/generated/prisma/enums";

import type { TransitionGateContext } from "./status";

/**
 * Custom-order money maths (US-C4 DoD). Balance due =
 * quotedPriceKobo + deliveryFeeKobo − sum(successful custom-order payments).
 * Pending, failed and abandoned payments never count.
 */

export interface PaymentLike {
  kind: PaymentKind;
  status: PaymentStatus;
  amountKobo: number;
}

export interface QuoteLike {
  quotedPriceKobo: number | null;
  depositKobo: number | null;
  deliveryFeeKobo: number | null;
}

export interface Balance {
  /** Quote + delivery fee (0 until quoted). */
  totalDueKobo: number;
  /** Sum of successful deposit and balance payments. */
  paidKobo: number;
  /** Total due minus paid; negative if overpaid. */
  balanceDueKobo: number;
  hasSuccessfulDeposit: boolean;
}

const COUNTED_KINDS: readonly PaymentKind[] = ["CUSTOM_DEPOSIT", "CUSTOM_BALANCE"];

export function computeBalance(order: QuoteLike, payments: readonly PaymentLike[]): Balance {
  const successful = payments.filter(
    (p) => p.status === "SUCCESS" && COUNTED_KINDS.includes(p.kind),
  );
  const paidKobo = successful.reduce((sum, p) => sum + p.amountKobo, 0);
  const totalDueKobo = (order.quotedPriceKobo ?? 0) + (order.deliveryFeeKobo ?? 0);
  return {
    totalDueKobo,
    paidKobo,
    balanceDueKobo: totalDueKobo - paidKobo,
    hasSuccessfulDeposit: successful.some((p) => p.kind === "CUSTOM_DEPOSIT"),
  };
}

/** Facts `canTransition` needs, derived from the order and its payments. */
export function buildTransitionContext(
  order: QuoteLike,
  payments: readonly PaymentLike[],
): TransitionGateContext {
  const { balanceDueKobo, hasSuccessfulDeposit } = computeBalance(order, payments);
  return {
    quotedPriceKobo: order.quotedPriceKobo,
    depositKobo: order.depositKobo,
    hasSuccessfulDeposit,
    balanceDueKobo,
  };
}

/** US-C1 AC7: cancelling after a deposit was paid forfeits it (D-11). */
export function cancellationForfeitsDeposit(
  to: CustomOrderStatus,
  payments: readonly PaymentLike[],
): boolean {
  return (
    to === "CANCELLED" &&
    payments.some((p) => p.kind === "CUSTOM_DEPOSIT" && p.status === "SUCCESS")
  );
}

/** Which kind an offline payment should be recorded as, given the order's status. */
export function defaultOfflinePaymentKind(status: CustomOrderStatus): PaymentKind {
  return status === "AWAITING_DEPOSIT" ? "CUSTOM_DEPOSIT" : "CUSTOM_BALANCE";
}
