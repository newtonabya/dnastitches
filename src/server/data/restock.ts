import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Restock auto-notify (v1.2, US-D4). Pending RESTOCK requests for a product are claimed
 * in one atomic UPDATE … RETURNING, only while the product is published and in stock,
 * so each person is emailed at most once even if two saves run at the same moment.
 */

type Db = Pick<PrismaClient, "$queryRaw" | "notificationRequest" | "product">;

export interface ClaimedRestock {
  id: string;
  email: string;
}

export async function claimRestockRequests(
  db: Db,
  productId: string,
  now: Date,
): Promise<ClaimedRestock[]> {
  return db.$queryRaw<ClaimedRestock[]>`
    UPDATE "NotificationRequest" AS n
    SET "notifiedAt" = ${now}
    FROM "Product" AS p
    WHERE n."productId" = p.id
      AND p.id = ${productId}
      AND p."isPublished"
      AND p.quantity > 0
      AND n.type = 'RESTOCK'::"NotificationRequestType"
      AND n."notifiedAt" IS NULL
    RETURNING n.id, n.email`;
}

/** Undo a claim whose email failed, so the next save retries it. */
export async function releaseRestockClaim(db: Db, requestId: string): Promise<void> {
  await db.notificationRequest.updateMany({
    where: { id: requestId },
    data: { notifiedAt: null },
  });
}

export async function getRestockEmailProduct(db: Db, productId: string) {
  return db.product.findUnique({
    where: { id: productId },
    select: { name: true, slug: true, priceKobo: true },
  });
}
