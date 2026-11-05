import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The token in the courier webhook URL (…/api/webhooks/sendbox?token=…). Sendbox doesn't
 * document a webhook signature, so this keeps strangers from making us poll; even a
 * valid call is only a nudge: the update itself is always fetched from Sendbox (D-25).
 */
export function courierWebhookToken(secret: string): string {
  return createHmac("sha256", secret).update("dna-stitches:courier-webhook").digest("base64url");
}

export function isValidCourierWebhookToken(token: string | null, secret: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(courierWebhookToken(secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
