import { getAnalytics } from "@/server/data/admin/analytics";

import { createTestPrisma, uid } from "./helpers/db";

/**
 * Every row here is dated in 2001 and `now` is mid-2001, so other tests' data (dated
 * today) is after `now` and never counted: the figures are exact.
 */

const prisma = createTestPrisma();
const prefix = uid("analytics");
const TZ = "Africa/Lagos";
const now = new Date("2001-06-15T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
let user = "";
let seq = 0;

async function product(quantity = 0) {
  return prisma.product.create({
    data: {
      slug: `${prefix}-${++seq}`,
      name: `Piece ${seq}`,
      description: "x",
      priceKobo: 1000,
      quantity,
      inventoryStatus: quantity > 0 ? "AVAILABLE" : "SOLD_OUT",
      fabricComposition: "x",
      careInstructions: "x",
    },
  });
}

async function payment(
  kind: "RTW_FULL" | "CUSTOM_DEPOSIT" | "CUSTOM_BALANCE",
  amountKobo: number,
  paidAt: Date,
  extra: { channel?: "PAYSTACK" | "OFFLINE"; customOrderId?: string; orderId?: string } = {},
) {
  return prisma.payment.create({
    data: {
      userId: user,
      kind,
      channel: extra.channel ?? "PAYSTACK",
      status: "SUCCESS",
      amountKobo,
      paidAt,
      orderId: extra.orderId,
      customOrderId: extra.customOrderId,
    },
  });
}

async function customOrder(createdAt: Date, data: Record<string, unknown> = {}) {
  return prisma.customOrder.create({
    data: {
      reference: `${prefix}-c${++seq}`,
      userId: user,
      title: "Gown",
      description: "x",
      createdAt,
      ...data,
    },
  });
}

async function appointment(
  type: "CONSULTATION" | "FITTING",
  status: "COMPLETED" | "NO_SHOW" | "CANCELLED" | "CONFIRMED",
  startsAt: Date,
) {
  return prisma.appointment.create({
    data: {
      userId: user,
      type,
      status,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
    },
  });
}

beforeAll(async () => {
  user = (await prisma.user.create({ data: { email: `${prefix}@example.com` } })).id;

  // Shop: two sales in range (one offline), one 60 days ago, one failed payment.
  const sold = await product();
  const order = await prisma.order.create({
    data: {
      userId: user,
      productId: sold.id,
      subtotalKobo: 1000,
      totalKobo: 1000,
      status: "FULFILLED",
      fulfillmentMethod: "PICKUP",
      finalSaleAcknowledgedAt: daysAgo(5),
    },
  });
  await payment("RTW_FULL", 3_000_000, daysAgo(5), { orderId: order.id });
  await payment("RTW_FULL", 5_000_000, daysAgo(10), { orderId: order.id, channel: "OFFLINE" });
  await payment("RTW_FULL", 7_000_000, daysAgo(60), { orderId: order.id });
  await prisma.payment.create({
    data: {
      userId: user,
      kind: "RTW_FULL",
      channel: "PAYSTACK",
      status: "FAILED",
      amountKobo: 99,
      orderId: order.id,
    },
  });

  // Custom funnel, requests in range: 4 received, 3 quoted, 2 deposits, 1 completed, 1 cancelled.
  const done = await customOrder(daysAgo(20), {
    status: "COMPLETED",
    quotedPriceKobo: 10_000_000,
    quoteSentAt: daysAgo(18),
    completedAt: daysAgo(2),
  });
  await payment("CUSTOM_DEPOSIT", 5_000_000, daysAgo(15), { customOrderId: done.id });
  await payment("CUSTOM_BALANCE", 5_000_000, daysAgo(2), { customOrderId: done.id });
  const deposit = await customOrder(daysAgo(8), {
    status: "IN_PRODUCTION",
    quotedPriceKobo: 4_000_000,
    quoteSentAt: daysAgo(7),
  });
  await payment("CUSTOM_DEPOSIT", 2_000_000, daysAgo(6), {
    customOrderId: deposit.id,
    channel: "OFFLINE",
  });
  await customOrder(daysAgo(4), { status: "CANCELLED", quotedPriceKobo: 1_000_000 });
  await customOrder(daysAgo(1));
  // Out of range: completed 30+ days ago after 40 days.
  await customOrder(daysAgo(80), { status: "COMPLETED", completedAt: daysAgo(40) });
  // After `now`: never counted.
  await customOrder(new Date("2001-07-01T00:00:00Z"));

  // Appointments in range: 2 consultations (1 completed, 1 no-show), 1 fitting, 1 cancelled.
  await appointment("CONSULTATION", "COMPLETED", daysAgo(3));
  await appointment("CONSULTATION", "NO_SHOW", daysAgo(9));
  await appointment("FITTING", "CONFIRMED", daysAgo(1));
  await appointment("FITTING", "CANCELLED", daysAgo(2));

  // Reviews in range: 5 and 4 stars.
  const reviewed = await product();
  await prisma.review.create({
    data: { userId: user, productId: reviewed.id, rating: 5, body: "x", createdAt: daysAgo(3) },
  });
  await prisma.review.create({
    data: { userId: user, customOrderId: done.id, rating: 4, body: "x", createdAt: daysAgo(1) },
  });

  // Demand: 3 waiting on one sold-out piece, 1 on another, 1 already notified.
  const wanted = await product();
  const other = await product(2);
  for (let i = 0; i < 3; i++)
    await prisma.notificationRequest.create({
      data: {
        email: `${prefix}-w${i}@example.com`,
        productId: wanted.id,
        type: "RESTOCK",
        createdAt: daysAgo(i + 1),
      },
    });
  await prisma.notificationRequest.create({
    data: {
      email: `${prefix}-o@example.com`,
      productId: other.id,
      type: "RESTOCK",
      createdAt: daysAgo(2),
    },
  });
  await prisma.notificationRequest.create({
    data: {
      email: `${prefix}-n@example.com`,
      productId: other.id,
      type: "SIMILAR_FABRIC",
      createdAt: daysAgo(2),
      notifiedAt: daysAgo(1),
    },
  });
});

afterAll(async () => {
  // Remove everything, so reruns against the same database still count exactly.
  await prisma.notificationRequest.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.payment.deleteMany({ where: { userId: user } });
  await prisma.review.deleteMany({ where: { userId: user } });
  await prisma.appointment.deleteMany({ where: { userId: user } });
  await prisma.order.deleteMany({ where: { userId: user } });
  await prisma.customOrder.deleteMany({ where: { userId: user } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.delete({ where: { id: user } });
  await prisma.$disconnect();
});

test("revenue splits by stream and channel, within the last 30 days only", async () => {
  const a = await getAnalytics(prisma, { now, range: "30d", timeZone: TZ });
  expect(a.revenue).toEqual({
    totalKobo: 3_000_000 + 5_000_000 + 5_000_000 + 5_000_000 + 2_000_000,
    shopKobo: 8_000_000,
    customKobo: 12_000_000,
    onlineKobo: 13_000_000,
    offlineKobo: 7_000_000,
    payments: 5,
  });
  expect(a.shop).toEqual({ piecesSold: 2, averageOrderKobo: 4_000_000 });
});

test("a wider range includes older payments", async () => {
  const a = await getAnalytics(prisma, { now, range: "90d", timeZone: TZ });
  expect(a.revenue.shopKobo).toBe(15_000_000);
  expect(a.shop.piecesSold).toBe(3);
});

test("the 12-month trend is zero-filled and ends with the current month", async () => {
  const a = await getAnalytics(prisma, { now, range: "30d", timeZone: TZ });
  expect(a.trend).toHaveLength(12);
  expect(a.trend[0]!.month).toBe("2000-07");
  expect(a.trend.at(-1)!.month).toBe("2001-06");
  const byMonth = Object.fromEntries(a.trend.map((t) => [t.month, t.amountKobo]));
  // April 16 (60 days ago) is in April; the rest are May 16 – June 13.
  expect(byMonth["2001-04"]).toBe(7_000_000);
  expect(byMonth["2001-05"]! + byMonth["2001-06"]!).toBe(20_000_000);
  expect(byMonth["2001-01"]).toBe(0);
});

test("the custom funnel follows the requests received in the range", async () => {
  const a = await getAnalytics(prisma, { now, range: "30d", timeZone: TZ });
  expect(a.custom).toEqual({
    requests: 4,
    quoted: 3,
    depositPaid: 2,
    completed: 1,
    cancelled: 1,
    quotedRate: 75,
    depositRate: 50,
    completedRate: 25,
    medianDaysToComplete: 18,
  });
  const all = await getAnalytics(prisma, { now, range: "all", timeZone: TZ });
  expect(all.custom.requests).toBe(5);
  expect(all.custom.medianDaysToComplete).toBe(29); // median of 18 and 40
});

test("appointments by type, cancelled left out, and the no-show rate", async () => {
  const a = await getAnalytics(prisma, { now, range: "30d", timeZone: TZ });
  expect(a.appointments).toEqual({
    byType: { CONSULTATION: 2, MEASUREMENT: 0, FITTING: 1, PICKUP: 0 },
    total: 3,
    completed: 1,
    noShows: 1,
    noShowRate: 50,
  });
});

test("reviews and the most-wanted pieces", async () => {
  const a = await getAnalytics(prisma, { now, range: "30d", timeZone: TZ });
  expect(a.reviews).toEqual({ count: 2, averageRating: 4.5 });
  expect(a.demand.map((d) => [d.name.startsWith("Piece"), d.waiting, d.soldOut])).toEqual([
    [true, 3, true],
    [true, 1, false],
  ]);
});

test("an empty period gives zeros and dashes, not errors", async () => {
  const a = await getAnalytics(prisma, {
    now: new Date("1990-01-01T00:00:00Z"),
    range: "30d",
    timeZone: TZ,
  });
  expect(a.revenue.totalKobo).toBe(0);
  expect(a.shop.averageOrderKobo).toBeNull();
  expect(a.custom.quotedRate).toBeNull();
  expect(a.appointments.noShowRate).toBeNull();
  expect(a.reviews.averageRating).toBeNull();
  expect(a.demand).toEqual([]);
});
