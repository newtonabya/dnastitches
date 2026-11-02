import "server-only";

import type { CustomOrderStatus, PaymentKind } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  buildTransitionContext,
  cancellationForfeitsDeposit,
  computeBalance,
} from "@/lib/custom-order/balance";
import { STATUS_LABELS, TERMINAL_STATUSES, canTransition } from "@/lib/custom-order/status";

/**
 * Admin custom-order reads and writes (US-C1, admin side of US-C4). Status changes
 * go through `canTransition` (allowed edges + gates) and write the audit log in the
 * same transaction. Updates are conditional on the status we read, so two admins
 * acting at once can't both succeed.
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export const PIPELINE_STATUSES = [
  "REQUEST_RECEIVED",
  "CONSULTATION_PENDING",
  "MEASUREMENTS_TAKEN",
  "AWAITING_DEPOSIT",
  "IN_PRODUCTION",
  "FITTING",
  "READY",
] as const satisfies readonly CustomOrderStatus[];

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export interface PipelineCard {
  id: string;
  reference: string;
  title: string;
  status: CustomOrderStatus;
  customerName: string | null;
  customerEmail: string;
  updatedAt: Date;
  targetDate: Date | null;
  source: "product" | "portfolio" | null;
}

const cardSelect = {
  id: true,
  reference: true,
  title: true,
  status: true,
  updatedAt: true,
  targetDate: true,
  sourceProductId: true,
  portfolioItemId: true,
  user: { select: { name: true, email: true } },
} as const;

type CardRow = {
  id: string;
  reference: string;
  title: string;
  status: CustomOrderStatus;
  updatedAt: Date;
  targetDate: Date | null;
  sourceProductId: string | null;
  portfolioItemId: string | null;
  user: { name: string | null; email: string };
};

function toCard(o: CardRow): PipelineCard {
  return {
    id: o.id,
    reference: o.reference,
    title: o.title,
    status: o.status,
    customerName: o.user.name,
    customerEmail: o.user.email,
    updatedAt: o.updatedAt,
    targetDate: o.targetDate,
    source: o.sourceProductId ? "product" : o.portfolioItemId ? "portfolio" : null,
  };
}

/** Active orders for the Kanban board, oldest-updated first within each column. */
export async function listPipelineCards(db: Pick<Db, "customOrder">): Promise<PipelineCard[]> {
  const rows = await db.customOrder.findMany({
    where: { status: { notIn: [...TERMINAL_STATUSES] } },
    orderBy: { updatedAt: "asc" },
    select: cardSelect,
  });
  return rows.map(toCard);
}

/** Completed / cancelled orders for the filterable list view (US-C1 AC1). */
export async function listClosedOrders(
  db: Pick<Db, "customOrder">,
  status?: "COMPLETED" | "CANCELLED",
): Promise<PipelineCard[]> {
  const rows = await db.customOrder.findMany({
    where: { status: status ? status : { in: [...TERMINAL_STATUSES] } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: cardSelect,
  });
  return rows.map(toCard);
}

export async function countOrdersByStatus(db: Pick<Db, "customOrder">) {
  const rows = await db.customOrder.groupBy({ by: ["status"], _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count])) as Partial<
    Record<CustomOrderStatus, number>
  >;
}

/** Everything the order detail page shows (US-C1 AC5, US-C4). */
export async function getAdminOrderDetail(db: Pick<Db, "customOrder">, orderId: string) {
  const order = await db.customOrder.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      fabricSwatch: { select: { id: true, name: true, colorHex: true, composition: true } },
      measurementProfile: true,
      sourceProduct: { select: { id: true, name: true, slug: true } },
      portfolioItem: { select: { id: true, title: true, imageUrl: true } },
      address: true,
      statusLogs: {
        orderBy: { createdAt: "asc" },
        include: { changedBy: { select: { name: true, email: true } } },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        include: { recordedBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!order) return null;
  return { ...order, balance: computeBalance(order, order.payments) };
}

export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof getAdminOrderDetail>>>;

export type TransitionOutcome =
  | { ok: true; from: CustomOrderStatus; to: CustomOrderStatus }
  | { ok: false; code: string; message: string };

export interface TransitionInput {
  orderId: string;
  to: CustomOrderStatus;
  actorId: string | null;
  note?: string;
  confirmForfeit?: boolean;
  /** Status the caller last saw; if it no longer matches, the move is refused (stale screen). */
  expectedFrom?: CustomOrderStatus;
}

const CONFLICT_MESSAGE = "This order was just updated by someone else. Refresh and try again.";

/** Transition inside an existing transaction. */
async function transitionInTx(tx: Tx, input: TransitionInput): Promise<TransitionOutcome> {
  const order = await tx.customOrder.findUnique({
    where: { id: input.orderId },
    select: {
      status: true,
      quotedPriceKobo: true,
      depositKobo: true,
      deliveryFeeKobo: true,
      payments: { select: { kind: true, status: true, amountKobo: true } },
    },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found." };
  if (input.expectedFrom && input.expectedFrom !== order.status) {
    return { ok: false, code: "CONFLICT", message: CONFLICT_MESSAGE };
  }

  const check = canTransition(
    order.status,
    input.to,
    buildTransitionContext(order, order.payments),
  );
  if (!check.ok) return check;

  if (cancellationForfeitsDeposit(input.to, order.payments) && !input.confirmForfeit) {
    return {
      ok: false,
      code: "CONFIRM_FORFEIT",
      message: "A deposit has been paid and is non-refundable. Confirm to cancel anyway.",
    };
  }

  const updated = await tx.customOrder.updateMany({
    where: { id: input.orderId, status: order.status },
    data: { status: input.to, ...(input.to === "COMPLETED" ? { completedAt: new Date() } : {}) },
  });
  if (updated.count !== 1) {
    return { ok: false, code: "CONFLICT", message: CONFLICT_MESSAGE };
  }
  await tx.customOrderStatusLog.create({
    data: {
      customOrderId: input.orderId,
      fromStatus: order.status,
      toStatus: input.to,
      changedById: input.actorId,
      note: input.note ?? null,
    },
  });
  return { ok: true, from: order.status, to: input.to };
}

/** US-C1: move an order (allowed transitions and gates enforced) and log it atomically. */
export async function transitionCustomOrder(
  db: Db,
  input: TransitionInput,
): Promise<TransitionOutcome> {
  return db.$transaction((tx) => transitionInTx(tx, input));
}

export type QuoteOutcome =
  { ok: true; movedToAwaitingDeposit: boolean } | { ok: false; code: string; message: string };

const QUOTABLE: readonly CustomOrderStatus[] = [
  "CONSULTATION_PENDING",
  "MEASUREMENTS_TAKEN",
  "AWAITING_DEPOSIT",
];

/**
 * US-C4 AC1: save the quote and send it. From MEASUREMENTS_TAKEN this also moves the
 * order to AWAITING_DEPOSIT; while awaiting the deposit the quote can be revised.
 */
export async function sendQuote(
  db: Db,
  input: {
    orderId: string;
    quotedPriceKobo: number;
    depositKobo: number;
    deliveryFeeKobo: number;
    actorId: string;
  },
): Promise<QuoteOutcome> {
  return db.$transaction(async (tx) => {
    const order = await tx.customOrder.findUnique({
      where: { id: input.orderId },
      select: { status: true },
    });
    if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found." };
    if (!QUOTABLE.includes(order.status)) {
      return {
        ok: false,
        code: "NOT_QUOTABLE",
        message: `Can't change the quote once an order is ${STATUS_LABELS[order.status].toLowerCase()}.`,
      };
    }
    await tx.customOrder.update({
      where: { id: input.orderId },
      data: {
        quotedPriceKobo: input.quotedPriceKobo,
        depositKobo: input.depositKobo,
        deliveryFeeKobo: input.deliveryFeeKobo,
        quoteSentAt: new Date(),
      },
    });
    if (order.status !== "MEASUREMENTS_TAKEN") return { ok: true, movedToAwaitingDeposit: false };
    const moved = await transitionInTx(tx, {
      orderId: input.orderId,
      to: "AWAITING_DEPOSIT",
      actorId: input.actorId,
      note: "Quote sent",
    });
    if (!moved.ok) throw new Error(moved.message);
    return { ok: true, movedToAwaitingDeposit: true };
  });
}

export type OfflinePaymentOutcome =
  | { ok: true; paymentId: string; advancedTo: CustomOrderStatus | null }
  | { ok: false; code: string; message: string };

/**
 * US-C4 AC5: record a cash / direct-transfer payment, attributed to the admin. It
 * counts exactly like a Paystack payment: a deposit on an order awaiting one moves
 * it to IN_PRODUCTION automatically (AC3).
 */
export async function recordOfflinePayment(
  db: Db,
  input: {
    orderId: string;
    kind: Extract<PaymentKind, "CUSTOM_DEPOSIT" | "CUSTOM_BALANCE">;
    amountKobo: number;
    note?: string;
    actorId: string;
  },
): Promise<OfflinePaymentOutcome> {
  return db.$transaction(async (tx) => {
    const order = await tx.customOrder.findUnique({
      where: { id: input.orderId },
      select: { status: true, userId: true },
    });
    if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found." };
    if (order.status === "CANCELLED")
      return { ok: false, code: "CANCELLED", message: "This order is cancelled." };

    const payment = await tx.payment.create({
      data: {
        userId: order.userId,
        kind: input.kind,
        channel: "OFFLINE",
        status: "SUCCESS",
        amountKobo: input.amountKobo,
        currency: "NGN",
        customOrderId: input.orderId,
        paidAt: new Date(),
        recordedById: input.actorId,
        rawEvent: input.note ? { note: input.note } : undefined,
      },
      select: { id: true },
    });

    let advancedTo: CustomOrderStatus | null = null;
    if (input.kind === "CUSTOM_DEPOSIT" && order.status === "AWAITING_DEPOSIT") {
      const moved = await transitionInTx(tx, {
        orderId: input.orderId,
        to: "IN_PRODUCTION",
        actorId: input.actorId,
        note: "Deposit received (offline payment)",
      });
      if (moved.ok) advancedTo = "IN_PRODUCTION";
    }
    return { ok: true, paymentId: payment.id, advancedTo };
  });
}

export async function updateAdminNotes(
  db: Pick<Db, "customOrder">,
  orderId: string,
  adminNotes: string,
) {
  const result = await db.customOrder.updateMany({
    where: { id: orderId },
    data: { adminNotes: adminNotes.trim() || null },
  });
  return result.count === 1;
}

/** Data for the customer status email after a change. */
export async function getStatusEmailData(db: Pick<Db, "customOrder">, orderId: string) {
  const o = await db.customOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      quotedPriceKobo: true,
      depositKobo: true,
      deliveryFeeKobo: true,
      fulfillmentMethod: true,
      user: { select: { name: true, email: true } },
      payments: { select: { kind: true, status: true, amountKobo: true } },
    },
  });
  if (!o) return null;
  return {
    status: o.status,
    orderId: o.id,
    reference: o.reference,
    title: o.title,
    customerName: o.user.name,
    customerEmail: o.user.email,
    quotedPriceKobo: o.quotedPriceKobo,
    depositKobo: o.depositKobo,
    deliveryFeeKobo: o.deliveryFeeKobo,
    fulfillmentMethod: o.fulfillmentMethod,
    balanceDueKobo: computeBalance(o, o.payments).balanceDueKobo,
  };
}
