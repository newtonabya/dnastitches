import { CustomOrderStatus } from "@/generated/prisma/enums";

/**
 * Custom-order pipeline rules (PRD US-C1, US-D1).
 *
 * REQUEST_RECEIVED → CONSULTATION_PENDING → MEASUREMENTS_TAKEN → AWAITING_DEPOSIT
 *   → IN_PRODUCTION → FITTING → READY → COMPLETED
 * (any state before IN_PRODUCTION) → CANCELLED
 * FITTING → IN_PRODUCTION (alterations loop)
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<CustomOrderStatus, readonly CustomOrderStatus[]>
> = {
  REQUEST_RECEIVED: ["CONSULTATION_PENDING", "CANCELLED"],
  CONSULTATION_PENDING: ["MEASUREMENTS_TAKEN", "CANCELLED"],
  MEASUREMENTS_TAKEN: ["AWAITING_DEPOSIT", "CANCELLED"],
  AWAITING_DEPOSIT: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["FITTING"],
  FITTING: ["READY", "IN_PRODUCTION"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly CustomOrderStatus[] = [
  CustomOrderStatus.COMPLETED,
  CustomOrderStatus.CANCELLED,
];

/** The order facts needed to evaluate transition gates. */
export interface TransitionGateContext {
  quotedPriceKobo: number | null;
  depositKobo: number | null;
  /** True when at least one SUCCESS payment of kind CUSTOM_DEPOSIT exists. */
  hasSuccessfulDeposit: boolean;
  /** quotedPriceKobo + deliveryFeeKobo − sum(successful payments). */
  balanceDueKobo: number;
}

export type TransitionResult =
  | { ok: true }
  | {
      ok: false;
      code: "SAME_STATUS" | "NOT_ALLOWED" | "QUOTE_MISSING" | "DEPOSIT_NOT_PAID" | "BALANCE_DUE";
      message: string;
    };

export function isTransitionAllowed(from: CustomOrderStatus, to: CustomOrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Check whether a custom order may move from `from` to `to`, including the
 * server-side gates (US-C1):
 * - → AWAITING_DEPOSIT requires quotedPriceKobo and depositKobo
 * - → IN_PRODUCTION requires a successful deposit payment
 * - → COMPLETED requires balance due = 0
 */
export function canTransition(
  from: CustomOrderStatus,
  to: CustomOrderStatus,
  order: TransitionGateContext,
): TransitionResult {
  if (from === to) {
    return { ok: false, code: "SAME_STATUS", message: "Order is already in this status." };
  }
  if (!isTransitionAllowed(from, to)) {
    return {
      ok: false,
      code: "NOT_ALLOWED",
      message: `Cannot move an order from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.`,
    };
  }
  switch (to) {
    case "AWAITING_DEPOSIT":
      if (order.quotedPriceKobo == null || order.depositKobo == null) {
        return {
          ok: false,
          code: "QUOTE_MISSING",
          message: "Set the quoted price and deposit before requesting a deposit.",
        };
      }
      break;
    case "IN_PRODUCTION":
      if (!order.hasSuccessfulDeposit) {
        return { ok: false, code: "DEPOSIT_NOT_PAID", message: "Deposit not yet paid." };
      }
      break;
    case "COMPLETED":
      if (order.balanceDueKobo > 0) {
        return {
          ok: false,
          code: "BALANCE_DUE",
          message: "Balance must be fully paid before completing the order.",
        };
      }
      break;
    default:
      break;
  }
  return { ok: true };
}

/** Fixed progress mapping for My Wardrobe (US-D1). `null` = no bar ("Cancelled"). */
export const STATUS_PROGRESS: Readonly<Record<CustomOrderStatus, number | null>> = {
  REQUEST_RECEIVED: 5,
  CONSULTATION_PENDING: 15,
  MEASUREMENTS_TAKEN: 30,
  AWAITING_DEPOSIT: 40,
  IN_PRODUCTION: 55,
  FITTING: 80,
  READY: 95,
  COMPLETED: 100,
  CANCELLED: null,
};

export function statusToProgress(status: CustomOrderStatus): number | null {
  return STATUS_PROGRESS[status];
}

/** Customer-facing labels. */
export const STATUS_LABELS: Readonly<Record<CustomOrderStatus, string>> = {
  REQUEST_RECEIVED: "Request received",
  CONSULTATION_PENDING: "Consultation pending",
  MEASUREMENTS_TAKEN: "Measurements taken",
  AWAITING_DEPOSIT: "Awaiting deposit",
  IN_PRODUCTION: "In production",
  FITTING: "Fitting",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
