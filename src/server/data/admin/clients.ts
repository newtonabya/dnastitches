import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeNigerianPhone } from "@/lib/nigeria";

import { listAllProfileVersions } from "../measurements";

type Db = PrismaClient;

export interface ClientRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  customOrderCount: number;
  lastActivityAt: Date;
}

/**
 * US-C2 AC1: customers, searchable by name, email or phone (local 080… or +234
 * formats). Includes the custom-order count and last activity. Related rows are
 * fetched with one query per relation (Prisma batches `include`), never per user.
 */
export async function searchClients(
  db: Pick<Db, "user">,
  query?: string,
  limit = 100,
): Promise<ClientRow[]> {
  const q = query?.trim();
  const phone = q ? normalizeNigerianPhone(q) : null;
  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: phone ?? q.replace(/\s+/g, "") } },
          ],
        }
      : {}),
  };
  const users = await db.user.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      updatedAt: true,
      _count: { select: { customOrders: true } },
      customOrders: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      orders: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
  });
  return users
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      customOrderCount: u._count.customOrders,
      lastActivityAt: new Date(
        Math.max(
          u.updatedAt.getTime(),
          u.customOrders[0]?.updatedAt.getTime() ?? 0,
          u.orders[0]?.updatedAt.getTime() ?? 0,
        ),
      ),
    }))
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

/**
 * US-C2 AC2: everything about one client. One query per relation, run in parallel,
 * so the number of queries is fixed whatever the client's history (no N+1).
 */
export async function getClientProfile(db: Db, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  });
  if (!user) return null;

  const [
    measurements,
    addresses,
    customOrders,
    orders,
    payments,
    repairRequests,
    appointments,
    notificationRequests,
  ] = await Promise.all([
    listAllProfileVersions(db, userId),
    db.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
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
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalKobo: true,
        createdAt: true,
        fulfillmentMethod: true,
        product: { select: { name: true, slug: true } },
      },
    }),
    db.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        channel: true,
        status: true,
        amountKobo: true,
        paidAt: true,
        createdAt: true,
        customOrder: { select: { reference: true } },
      },
    }),
    db.repairRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, description: true, createdAt: true },
    }),
    db.appointment.findMany({
      where: { userId },
      orderBy: { startsAt: "desc" },
      select: { id: true, type: true, status: true, startsAt: true },
    }),
    db.notificationRequest.findMany({
      where: { OR: [{ userId }, { email: user.email }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        createdAt: true,
        notifiedAt: true,
        product: { select: { name: true, slug: true } },
      },
    }),
  ]);

  return {
    user,
    measurements,
    addresses,
    customOrders,
    orders,
    payments,
    repairRequests,
    appointments,
    notificationRequests,
  };
}

export type ClientProfile = NonNullable<Awaited<ReturnType<typeof getClientProfile>>>;
