import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Demo sign-in (for testing the live site before email is fully set up). When
 * DEMO_ACCESS_CODE is set, the sign-in page also accepts an email plus that passcode and
 * signs straight in: Auth.js creates its usual one-time sign-in link, which is captured
 * here instead of emailed, and the browser is sent to it. Remove the variable to turn it
 * off (it must be off for real launch: anyone with the passcode can sign in as anyone).
 */

/** While set, the email provider stores the sign-in link here instead of sending it. */
export const demoLinkCapture = new AsyncLocalStorage<{ url?: string }>();

/** Constant-time passcode check (digests have equal length whatever the input). */
export function isDemoPasscode(given: string | null | undefined, expected: string | undefined) {
  if (!expected || !given) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(given.trim()), digest(expected));
}
