import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a cron request carries `Authorization: Bearer <CRON_SECRET>`. Compares
 * SHA-256 digests in constant time, so response timing reveals nothing about the
 * secret. Always false when no secret is configured.
 */
export function isAuthorizedCron(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
