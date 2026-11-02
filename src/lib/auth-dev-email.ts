import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Development fallback for magic-link emails when AUTH_RESEND_KEY is not set:
 * prints the sign-in link to the server console instead of emailing it.
 * If E2E_MAGIC_LINK_FILE is set, the link is also appended to that file so
 * Playwright can complete the sign-in flow. Never used in production.
 */
export async function devSendVerificationRequest({
  identifier,
  url,
}: {
  identifier: string;
  url: string;
}) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email sign-in requires AUTH_RESEND_KEY in production.");
  }
  console.info(`\n[auth] Magic sign-in link for ${identifier}:\n${url}\n`);
  const file = process.env.E2E_MAGIC_LINK_FILE;
  if (file) {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify({ identifier, url })}\n`);
  }
}
