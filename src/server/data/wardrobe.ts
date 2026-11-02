import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { isReservationActive } from "@/lib/checkout";
import { computeBalance } from "@/lib/custom-order/balance";
import { TERMINAL_STATUSES } from "@/lib/custom-order/status";

/**
 * My Wardrobe (US-D1). Every query is scoped by the signed-in customer's id, so
 * another user's order ID behaves exactly like a missing one (AC4). Admin notes
 * and who-changed-what are never returned.
 */

type Db = PrismaClient;

export async function listWardrobe(db: Db, userId: string, now = new Date()) {
  const [customOrders, orders] = await Promise.all([
    db.customOrder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.order.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalKobo: true,
        createdAt: true,
        fulfillmentMethod: true,
        fulfilledAt: true,
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);
  const active = customOrders.filter((o) => !TERMINAL_STATUSES.includes(o.status));
  const closed = customOrders.filter((o) => TERMINAL_STATUSES.includes(o.status));
  return {
    // Active first (AC1), each group newest first.
    customOrders: [...active, ...closed],
    // A pending order whose hold lapsed is effectively cancelled; hide it.
    orders: orders.filter(
      (o) => o.status !== "PENDING_PAYMENT" || isReservationActive(o.createdAt, now),
    ),
  };
}

export async function getWardrobeOrder(db: Db, userId: string, orderId: string) {
  const order = await db.customOrder.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      reference: true,
      title: true,
      description: true,
      status: true,
      occasion: true,
      targetDate: true,
      referenceImageUrls: true,
      quotedPriceKobo: true,
      depositKobo: true,
      deliveryFeeKobo: true,
      quoteSentAt: true,
      fulfillmentMethod: true,
      createdAt: true,
      completedAt: true,
      reviews: { select: { id: true, isApproved: true, moderatedAt: true } },
      appointments: {
        where: { status: { in: ["REQUESTED", "CONFIRMED"] } },
        orderBy: { startsAt: "asc" },
        select: { id: true, type: true, status: true, startsAt: true, endsAt: true },
      },
      repairRequests: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          description: true,
          rejectionReason: true,
          createdAt: true,
        },
      },
      fabricSwatch: { select: { name: true, colorHex: true } },
      address: { select: { recipientName: true, line1: true, city: true, state: true } },
      statusLogs: {
        orderBy: { createdAt: "asc" },
        select: { id: true, toStatus: true, createdAt: true },
      },
      payments: {
        where: { status: "SUCCESS" },
        orderBy: { paidAt: "asc" },
        select: {
          id: true,
          kind: true,
          status: true,
          amountKobo: true,
          paidAt: true,
          channel: true,
        },
      },
    },
  });
  if (!order) return null;
  return { ...order, balance: computeBalance(order, order.payments) };
}

export type WardrobeOrder = NonNullable<Awaited<ReturnType<typeof getWardrobeOrder>>>;

/** A customer's own RTW order, for the checkout confirmation page. */
export async function getOwnShopOrder(db: Pick<Db, "order">, userId: string, orderId: string) {
  return db.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      status: true,
      totalKobo: true,
      subtotalKobo: true,
      deliveryFeeKobo: true,
      fulfillmentMethod: true,
      product: { select: { name: true, slug: true, id: true } },
      address: { select: { recipientName: true, line1: true, city: true, state: true } },
      deliveryZone: { select: { etaDays: true } },
    },
  });
}

/** Admin: ready-to-wear orders worth acting on (paid, fulfilled, or still in checkout). */
export async function listShopOrders(db: Pick<Db, "order">) {
  return db.order.findMany({
    where: { status: { in: ["PAID", "FULFILLED", "PENDING_PAYMENT"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      totalKobo: true,
      fulfillmentMethod: true,
      createdAt: true,
      fulfilledAt: true,
      product: { select: { name: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
      address: {
        select: {
          recipientName: true,
          phone: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          landmark: true,
        },
      },
    },
  });
}
