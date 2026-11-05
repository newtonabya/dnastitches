import "server-only";

import { env } from "@/lib/env";
import { type SmsProvider, createTermiiProvider } from "@/lib/sms/termii";

/**
 * The configured text-message provider, or null when texts can't be sent. Without
 * TERMII_API_KEY, development logs each message instead (without the number); production
 * returns null and text reminders are skipped with a visible reason.
 */
export function getSmsProvider(): SmsProvider | null {
  if (env.TERMII_API_KEY && env.TERMII_SENDER_ID) {
    return createTermiiProvider({
      apiKey: env.TERMII_API_KEY,
      senderId: env.TERMII_SENDER_ID,
      channel: env.TERMII_CHANNEL,
    });
  }
  if (env.NODE_ENV === "production") return null;
  return {
    async send({ text }) {
      console.info(`\n[sms] (dev, not sent) ${text}\n`);
    },
  };
}
