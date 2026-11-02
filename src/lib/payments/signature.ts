import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack webhook signature (US-A4 DoD): `x-paystack-signature` is the hex
 * HMAC-SHA512 of the raw request body, keyed with the secret key. Compared in
 * constant time.
 */
export function signPaystackBody(rawBody: string, secretKey: string): string {
  return createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
}

export function isValidPaystackSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string,
): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(signPaystackBody(rawBody, secretKey), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
