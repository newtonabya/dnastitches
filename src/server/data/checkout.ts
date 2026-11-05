import "server-only";

import type { CustomOrderStatus, FulfillmentMethod, PaymentKind } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { availableToReserve, isReservationActive, reservationCutoff } from "@/lib/checkout";
import { computeBalance } from "@/lib/custom-order/balance";
import { chooseDelivery, resolveDeliveryFee } from "@/lib/delivery";
import { deriveInventoryStatus } from "@/lib/inventory";
import { newPaymentReference } from "@/lib/payments/reference";
import type { Verification } from "@/lib/payments/types";

import { transitionInTx } from "./admin/orders";

/**
 * Checkout and payment finalisation (US-A4, US-C4).
 *
 * Stock is held by unexpired PENDING_PAYMENT orders: reserving locks the product row
 * (SELECT … FOR UPDATE) inside a transaction and counts active holds, so two buyers
 * can never both reserve the last piece. A hold expires 15 minutes after checkout
 * started (AC7) without needing a background job; `expireStaleOrders` tidies the rows.
 * Quantity is decremented only when payment succeeds (AC6), with the lock held.
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

async function lockProduct(tx: Tx, productId: string) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
}

async function countActiveHolds(tx: Tx, productId: string, now: Date, excludeOrderId?: string) {
  return tx.order.count({
    where: {
      productId,
      status: "PENDING_PAYMENT",
      createdAt: { gte: reservationCutoff(now) },
      ...(excludeOrderId ? { NOT: { id: excludeOrderId } } : {}),
    },
  });
}

async function cancelOrders(tx: Tx, orderIds: string[]) {
  if (orderIds.length === 0) return;
  await tx.order.updateMany({
    where: { id: { in: orderIds }, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED" },
  });
  await tx.payment.updateMany({
    where: { orderId: { in: orderIds }, status: "PENDING" },
    data: { status: "ABANDONED" },
  });
}

/** Cancel pending orders whose 15-minute hold has lapsed (AC7). Safe to run any time. */
export async function expireStaleOrders(
  db: Db,
  now = new Date(),
  productId?: string,
): Promise<number> {
  return db.$transaction(async (tx) => {
    const stale = await tx.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        createdAt: { lt: reservationCutoff(now) },
        ...(productId ? { productId } : {}),
      },
      select: { id: true },
    });
    await cancelOrders(
      tx,
      stale.map((o) => o.id),
    );
    return stale.length;
  });
}

export type ReserveResult =
  | { ok: true; orderId: string; reference: string; amountKobo: number; email: string }
  | { ok: false; code: "NOT_FOUND" | "CLAIMED" | "ADDRESS" | "NO_DELIVERY"; message: string };

export const CLAIMED_MESSAGE = "This piece was just claimed.";

/** US-A4: hold the piece and create a pending order + payment, all in one transaction. */
export async function reserveRtwOrder(
  db: Db,
  input: {
    userId: string;
    productId: string;
    fulfillmentMethod: FulfillmentMethod;
    addressId?: string;
    /** The courier's live price for this address, fetched before the transaction (US-D5). */
    courierQuote?: { feeKobo: number; courierName: string; etaDays: number | null } | null;
  },
  now = new Date(),
): Promise<ReserveResult> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, isPublished: true },
      select: { id: true, priceKobo: true },
    });
    if (!product)
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "This piece is no longer available.",
      } as const;
    await lockProduct(tx, product.id);
    const { quantity } = await tx.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { quantity: true },
    });

    // A customer retrying checkout releases their own earlier hold first.
    const own = await tx.order.findMany({
      where: { userId: input.userId, productId: product.id, status: "PENDING_PAYMENT" },
      select: { id: true },
    });
    await cancelOrders(
      tx,
      own.map((o) => o.id),
    );

    if (availableToReserve(quantity, await countActiveHolds(tx, product.id, now)) <= 0) {
      return { ok: false, code: "CLAIMED", message: CLAIMED_MESSAGE } as const;
    }

    let deliveryFeeKobo = 0;
    let deliveryZoneId: string | null = null;
    let deliveryQuotedBy: string | null = null;
    let addressId: string | null = null;
    if (input.fulfillmentMethod === "DELIVERY") {
      const address = await tx.address.findFirst({
        where: { id: input.addressId, userId: input.userId },
        select: { id: true, state: true },
      });
      if (!address)
        return {
          ok: false,
          code: "ADDRESS",
          message: "Choose one of your saved addresses.",
        } as const;
      const delivery = chooseDelivery(
        input.courierQuote ?? null,
        resolveDeliveryFee(
          address.state,
          await tx.deliveryZone.findMany({ where: { isActive: true } }),
        ),
      );
      if (!delivery) {
        return {
          ok: false,
          code: "NO_DELIVERY",
          message: `We don't deliver to ${address.state} yet. Please choose pickup.`,
        } as const;
      }
      deliveryFeeKobo = delivery.feeKobo;
      deliveryZoneId = delivery.zoneId;
      deliveryQuotedBy = delivery.quotedBy;
      addressId = address.id;
    }

    const totalKobo = product.priceKobo + deliveryFeeKobo;
    const reference = newPaymentReference("RTW_FULL");
    const order = await tx.order.create({
      data: {
        userId: input.userId,
        productId: product.id,
        subtotalKobo: product.priceKobo,
        deliveryFeeKobo,
        totalKobo,
        status: "PENDING_PAYMENT",
        fulfillmentMethod: input.fulfillmentMethod,
        addressId,
        deliveryZoneId,
        deliveryQuotedBy,
        finalSaleAcknowledgedAt: now,
        createdAt: now,
        payments: {
          create: {
            userId: input.userId,
            kind: "RTW_FULL",
            channel: "PAYSTACK",
            status: "PENDING",
            amountKobo: totalKobo,
            currency: "NGN",
            paystackReference: reference,
          },
        },
      },
      select: { id: true, user: { select: { email: true } } },
    });
    return {
      ok: true,
      orderId: order.id,
      reference,
      amountKobo: totalKobo,
      email: order.user.email,
    } as const;
  });
}

/** Release a hold straight away, e.g. when the payment provider couldn't start the payment. */
export async function cancelPendingOrder(db: Db, orderId: string) {
  await db.$transaction((tx) => cancelOrders(tx, [orderId]));
}

export type StartCustomPaymentResult =
  | { ok: true; reference: string; amountKobo: number; email: string }
  | { ok: false; code: "NOT_FOUND" | "NOT_PAYABLE"; message: string };

/**
 * US-C4 AC2/AC4: the customer pays the deposit (order awaiting it) or the balance
 * (order READY with money still due). Scoped to the order's owner.
 */
export async function startCustomOrderPayment(
  db: Db,
  input: {
    userId: string;
    orderId: string;
    kind: Extract<PaymentKind, "CUSTOM_DEPOSIT" | "CUSTOM_BALANCE">;
  },
): Promise<StartCustomPaymentResult> {
  return db.$transaction(async (tx) => {
    const order = await tx.customOrder.findFirst({
      where: { id: input.orderId, userId: input.userId },
      select: {
        id: true,
        status: true,
        quotedPriceKobo: true,
        depositKobo: true,
        deliveryFeeKobo: true,
        user: { select: { email: true } },
        payments: { select: { kind: true, status: true, amountKobo: true } },
      },
    });
    if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found." } as const;
    const balance = computeBalance(order, order.payments);

    let amountKobo = 0;
    if (
      input.kind === "CUSTOM_DEPOSIT" &&
      order.status === "AWAITING_DEPOSIT" &&
      !balance.hasSuccessfulDeposit
    ) {
      amountKobo = order.depositKobo ?? 0;
    } else if (input.kind === "CUSTOM_BALANCE" && order.status === "READY") {
      amountKobo = balance.balanceDueKobo;
    }
    if (amountKobo <= 0) {
      return {
        ok: false,
        code: "NOT_PAYABLE",
        message: "There's nothing to pay for this order right now.",
      } as const;
    }

    await tx.payment.updateMany({
      where: { customOrderId: order.id, kind: input.kind, status: "PENDING" },
      data: { status: "ABANDONED" },
    });
    const reference = newPaymentReference(input.kind);
    await tx.payment.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        channel: "PAYSTACK",
        status: "PENDING",
        amountKobo,
        currency: "NGN",
        customOrderId: order.id,
        paystackReference: reference,
      },
    });
    return { ok: true, reference, amountKobo, email: order.user.email } as const;
  });
}

export type FinalizeOutcome =
  | "UNKNOWN_REFERENCE"
  | "ALREADY_PROCESSED"
  | "PENDING"
  | "FAILED"
  | "AMOUNT_MISMATCH"
  | "RTW_PAID"
  | "RTW_PAID_UNAVAILABLE"
  | "DEPOSIT_PAID"
  | "CUSTOM_PAID";

export interface FinalizeResult {
  outcome: FinalizeOutcome;
  kind?: PaymentKind;
  orderId?: string | null;
  customOrderId?: string | null;
  advancedTo?: CustomOrderStatus;
}

/**
 * Apply a verified payment (US-A4 AC6, US-C4 AC3). Idempotent on the reference: the
 * webhook and the browser callback may both arrive, possibly at the same moment, and
 * only one of them changes anything.
 */
export async function finalizePayment(
  db: Db,
  reference: string,
  verification: Verification,
  now = new Date(),
): Promise<FinalizeResult> {
  const payment = await db.payment.findUnique({
    where: { paystackReference: reference },
    select: {
      id: true,
      status: true,
      kind: true,
      amountKobo: true,
      currency: true,
      orderId: true,
      customOrderId: true,
    },
  });
  if (!payment) return { outcome: "UNKNOWN_REFERENCE" };
  const ids = {
    kind: payment.kind,
    orderId: payment.orderId,
    customOrderId: payment.customOrderId,
  };
  if (payment.status === "SUCCESS") return { outcome: "ALREADY_PROCESSED", ...ids };
  if (verification.status === "pending") return { outcome: "PENDING", ...ids };

  if (verification.status !== "success") {
    await db.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: verification.status === "abandoned" ? "ABANDONED" : "FAILED",
          rawEvent: toJson(verification.raw),
        },
      });
      if (updated.count === 1 && payment.orderId) await cancelOrders(tx, [payment.orderId]);
    });
    return { outcome: "FAILED", ...ids };
  }

  if (
    verification.amountKobo !== payment.amountKobo ||
    verification.currency !== payment.currency
  ) {
    await db.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: {
        status: "FAILED",
        rawEvent: toJson({ reason: "amount or currency mismatch", verification: verification.raw }),
      },
    });
    return { outcome: "AMOUNT_MISMATCH", ...ids };
  }

  return db.$transaction(async (tx): Promise<FinalizeResult> => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: {
        status: "SUCCESS",
        paidAt: verification.paidAt ?? now,
        rawEvent: toJson(verification.raw),
      },
    });
    if (claimed.count !== 1) return { outcome: "ALREADY_PROCESSED", ...ids };

    if (payment.orderId) {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { id: true, status: true, createdAt: true, productId: true },
      });
      await lockProduct(tx, order.productId);
      const { quantity } = await tx.product.findUniqueOrThrow({
        where: { id: order.productId },
        select: { quantity: true },
      });
      const holdStillActive =
        order.status === "PENDING_PAYMENT" && isReservationActive(order.createdAt, now);
      const otherHolds = await countActiveHolds(tx, order.productId, now, order.id);
      // An active hold already accounts for this order; a lapsed one must find free stock.
      const canFulfil = holdStillActive
        ? quantity > 0
        : availableToReserve(quantity, otherHolds) > 0;
      if (!canFulfil) return { outcome: "RTW_PAID_UNAVAILABLE", ...ids };

      const remaining = quantity - 1;
      await tx.product.update({
        where: { id: order.productId },
        data: { quantity: remaining, inventoryStatus: deriveInventoryStatus(remaining) },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      return { outcome: "RTW_PAID", ...ids };
    }

    if (payment.customOrderId && payment.kind === "CUSTOM_DEPOSIT") {
      const moved = await transitionInTx(tx, {
        orderId: payment.customOrderId,
        to: "IN_PRODUCTION",
        actorId: null,
        note: "Deposit paid online (Paystack)",
        expectedFrom: "AWAITING_DEPOSIT",
      });
      if (moved.ok) return { outcome: "DEPOSIT_PAID", ...ids, advancedTo: "IN_PRODUCTION" };
    }
    return { outcome: "CUSTOM_PAID", ...ids };
  });
}

/** US-A4 AC8: admin marks a paid order as picked up / delivered; starts the defect window. */
export async function markOrderFulfilled(
  db: Pick<Db, "order">,
  orderId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db.order.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "FULFILLED", fulfilledAt: now },
  });
  return result.count === 1;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as object;
}
