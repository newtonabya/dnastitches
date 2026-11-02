import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Address } from "@/lib/validators/address";
import type { Profile } from "@/lib/validators/profile";

/**
 * Account reads/writes for /account/profile (US-E1 AC4). Every query is scoped by
 * `userId` so one customer can never touch another's data.
 */

type Db = Pick<PrismaClient, "user" | "address" | "order" | "customOrder" | "$transaction">;

export interface AccountAddress extends Address {
  id: string;
}

export interface AccountProfile {
  email: string;
  name: string | null;
  phone: string | null;
  addresses: AccountAddress[];
}

const addressSelect = {
  id: true,
  recipientName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  landmark: true,
  isDefault: true,
} as const;

export async function getAccountProfile(db: Db, userId: string): Promise<AccountProfile | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      phone: true,
      addresses: { select: addressSelect, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!user) return null;
  return {
    ...user,
    addresses: user.addresses.map((a) => ({
      ...a,
      line2: a.line2 ?? undefined,
      landmark: a.landmark ?? undefined,
      state: a.state as Address["state"],
    })),
  };
}

export async function updateProfile(db: Db, userId: string, data: Profile) {
  await db.user.update({
    where: { id: userId },
    data: { name: data.name, phone: data.phone ?? null },
  });
}

/** Create an address. The first address, or one marked default, becomes the only default. */
export async function createAddress(
  db: Db,
  userId: string,
  data: Address,
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.address.count({ where: { userId } });
    const isDefault = data.isDefault || existing === 0;
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({
      data: {
        userId,
        recipientName: data.recipientName,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        state: data.state,
        landmark: data.landmark ?? null,
        isDefault,
      },
      select: { id: true },
    });
  });
}

/** Make one of the user's addresses the default. Returns false if it isn't theirs. */
export async function setDefaultAddress(
  db: Db,
  userId: string,
  addressId: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });
    if (!owned) return false;
    await tx.address.updateMany({
      where: { userId, NOT: { id: addressId } },
      data: { isDefault: false },
    });
    await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    return true;
  });
}

export type DeleteAddressResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "IN_USE" };

/**
 * Delete one of the user's addresses. Addresses already used by an order are kept
 * so order history stays intact. If the default is deleted, the newest remaining
 * address becomes the default.
 */
export async function deleteAddress(
  db: Db,
  userId: string,
  addressId: string,
): Promise<DeleteAddressResult> {
  return db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true, isDefault: true },
    });
    if (!address) return { ok: false, reason: "NOT_FOUND" } as const;
    const [orders, customOrders] = await Promise.all([
      tx.order.count({ where: { addressId } }),
      tx.customOrder.count({ where: { addressId } }),
    ]);
    if (orders + customOrders > 0) return { ok: false, reason: "IN_USE" } as const;
    await tx.address.delete({ where: { id: addressId } });
    if (address.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { ok: true } as const;
  });
}
