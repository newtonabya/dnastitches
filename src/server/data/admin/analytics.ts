import "server-only";

import type { AppointmentType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  type AnalyticsRange,
  daysBetween,
  lastMonths,
  median,
  monthStart,
  percent,
  rangeStart,
  sumByMonth,
} from "@/lib/analytics";

/**
 * Admin analytics (v1.2, US-C5). Read-only aggregates over payments, orders, custom
 * orders, appointments, reviews and notify-me requests. Every figure is bounded by
 * [range start, now], so the numbers never include the future (or test data dated
 * after `now`).
 */

type Db = PrismaClient;

export const TREND_MONTHS = 12;

export interface AnalyticsOptions {
  now: Date;
  range: AnalyticsRange;
  timeZone: string;
}

export interface Analytics {
  from: Date | null;
  revenue: {
    totalKobo: number;
    shopKobo: number;
    customKobo: number;
    onlineKobo: number;
    offlineKobo: number;
    payments: number;
  };
  /** Always the last 12 studio-local months, whatever the range (oldest first). */
  trend: { month: string; amountKobo: number }[];
  shop: { piecesSold: number; averageOrderKobo: number | null };
  custom: {
    requests: number;
    quoted: number;
    depositPaid: number;
    completed: number;
    cancelled: number;
    quotedRate: number | null;
    depositRate: number | null;
    completedRate: number | null;
    /** Request to completion, for orders completed in the range. */
    medianDaysToComplete: number | null;
  };
  demand: { productId: string; name: string; slug: string; soldOut: boolean; waiting: number }[];
  appointments: {
    byType: Record<AppointmentType, number>;
    total: number;
    completed: number;
    noShows: number;
    noShowRate: number | null;
  };
  reviews: { count: number; averageRating: number | null };
}

export async function getAnalytics(
  db: Db,
  { now, range, timeZone }: AnalyticsOptions,
): Promise<Analytics> {
  const from = rangeStart(range, now, timeZone);
  const within = from ? { gte: from, lte: now } : { lte: now };
  const months = lastMonths(now, timeZone, TREND_MONTHS);
  const trendFrom = monthStart(months[0]!, timeZone);

  const [
    byKind,
    byChannel,
    trendPayments,
    requests,
    completedOrders,
    appointmentGroups,
    reviewStats,
    demandGroups,
  ] = await Promise.all([
    db.payment.groupBy({
      by: ["kind"],
      where: { status: "SUCCESS", paidAt: within },
      _sum: { amountKobo: true },
      _count: { _all: true },
    }),
    db.payment.groupBy({
      by: ["channel"],
      where: { status: "SUCCESS", paidAt: within },
      _sum: { amountKobo: true },
    }),
    db.payment.findMany({
      where: { status: "SUCCESS", paidAt: { gte: trendFrom, lte: now } },
      select: { paidAt: true, amountKobo: true },
    }),
    db.customOrder.findMany({
      where: { createdAt: within },
      select: {
        status: true,
        quoteSentAt: true,
        quotedPriceKobo: true,
        payments: {
          where: { kind: "CUSTOM_DEPOSIT", status: "SUCCESS" },
          select: { id: true },
          take: 1,
        },
      },
    }),
    db.customOrder.findMany({
      where: { status: "COMPLETED", completedAt: within },
      select: { createdAt: true, completedAt: true },
    }),
    db.appointment.groupBy({
      by: ["type", "status"],
      where: { startsAt: within },
      _count: { _all: true },
    }),
    db.review.aggregate({
      where: { createdAt: within },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    db.notificationRequest.groupBy({
      by: ["productId"],
      where: { notifiedAt: null, productId: { not: null }, createdAt: within },
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 10,
    }),
  ]);

  // Revenue.
  const kindSum = (kinds: string[]) =>
    byKind.filter((g) => kinds.includes(g.kind)).reduce((s, g) => s + (g._sum.amountKobo ?? 0), 0);
  const channelSum = (channel: string) =>
    byChannel.find((g) => g.channel === channel)?._sum.amountKobo ?? 0;
  const shopKobo = kindSum(["RTW_FULL"]);
  const customKobo = kindSum(["CUSTOM_DEPOSIT", "CUSTOM_BALANCE"]);
  const piecesSold = byKind.find((g) => g.kind === "RTW_FULL")?._count._all ?? 0;

  // Custom funnel: the requests received in the range, and how far each got.
  const quoted = requests.filter((r) => r.quoteSentAt || r.quotedPriceKobo !== null).length;
  const depositPaid = requests.filter((r) => r.payments.length > 0).length;
  const completed = requests.filter((r) => r.status === "COMPLETED").length;
  const cancelled = requests.filter((r) => r.status === "CANCELLED").length;
  const days = median(completedOrders.map((o) => daysBetween(o.createdAt, o.completedAt!)));

  // Appointments.
  const byType: Record<AppointmentType, number> = {
    CONSULTATION: 0,
    MEASUREMENT: 0,
    FITTING: 0,
    PICKUP: 0,
  };
  let apptCompleted = 0;
  let noShows = 0;
  for (const g of appointmentGroups) {
    if (g.status === "CANCELLED") continue;
    byType[g.type] += g._count._all;
    if (g.status === "COMPLETED") apptCompleted += g._count._all;
    if (g.status === "NO_SHOW") noShows += g._count._all;
  }

  // Demand: pending notify-me requests per product.
  const products = await db.product.findMany({
    where: { id: { in: demandGroups.map((g) => g.productId!) } },
    select: { id: true, name: true, slug: true, quantity: true },
  });
  const demand = demandGroups.flatMap((g) => {
    const p = products.find((x) => x.id === g.productId);
    return p
      ? [
          {
            productId: p.id,
            name: p.name,
            slug: p.slug,
            soldOut: p.quantity <= 0,
            waiting: g._count._all,
          },
        ]
      : [];
  });

  return {
    from,
    revenue: {
      totalKobo: shopKobo + customKobo,
      shopKobo,
      customKobo,
      onlineKobo: channelSum("PAYSTACK"),
      offlineKobo: channelSum("OFFLINE"),
      payments: byKind.reduce((s, g) => s + g._count._all, 0),
    },
    trend: sumByMonth(
      trendPayments.map((p) => ({ at: p.paidAt!, amountKobo: p.amountKobo })),
      months,
      timeZone,
    ),
    shop: {
      piecesSold,
      averageOrderKobo: piecesSold > 0 ? Math.round(shopKobo / piecesSold) : null,
    },
    custom: {
      requests: requests.length,
      quoted,
      depositPaid,
      completed,
      cancelled,
      quotedRate: percent(quoted, requests.length),
      depositRate: percent(depositPaid, requests.length),
      completedRate: percent(completed, requests.length),
      medianDaysToComplete: days === null ? null : Math.round(days),
    },
    demand: demand.slice(0, 5),
    appointments: {
      byType,
      total: Object.values(byType).reduce((s, n) => s + n, 0),
      completed: apptCompleted,
      noShows,
      noShowRate: percent(noShows, apptCompleted + noShows),
    },
    reviews: {
      count: reviewStats._count._all,
      averageRating:
        reviewStats._avg.rating === null ? null : Math.round(reviewStats._avg.rating * 10) / 10,
    },
  };
}
