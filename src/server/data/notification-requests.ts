import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { NotificationRequest } from "@/lib/validators/notification-request";

type Db = Pick<PrismaClient, "product" | "notificationRequest" | "$transaction">;

export type SaveNotificationResult = { ok: true } | { ok: false; reason: "PRODUCT_NOT_FOUND" };

/**
 * Record notify-me requests (US-D2 AC2): one row per selected type, idempotent via
 * upsert on the unique (email, productId, type) key. Re-submitting is a no-op.
 */
export async function saveNotificationRequests(
  db: Db,
  input: NotificationRequest & { userId?: string | null },
): Promise<SaveNotificationResult> {
  const product = await db.product.findFirst({
    where: { id: input.productId, isPublished: true },
    select: { id: true },
  });
  if (!product) return { ok: false, reason: "PRODUCT_NOT_FOUND" };

  await db.$transaction(
    input.types.map((type) =>
      db.notificationRequest.upsert({
        where: { email_productId_type: { email: input.email, productId: product.id, type } },
        // Link the account if the person signs in later; never unlink.
        update: input.userId ? { userId: input.userId } : {},
        create: { email: input.email, productId: product.id, type, userId: input.userId ?? null },
      }),
    ),
  );
  return { ok: true };
}
