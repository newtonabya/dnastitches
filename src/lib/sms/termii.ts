/**
 * Text-message sending (v1.2, US-G2). `SmsProvider` is what the app depends on; Termii
 * is the Nigerian provider behind it (SMS, including the DND route, and WhatsApp).
 * Another provider (e.g. Twilio) can implement the same interface.
 */

export interface SmsProvider {
  /** Sends one message; throws on failure so the caller can record and retry it. */
  send(message: { to: string; text: string }): Promise<void>;
}

export class SmsError extends Error {}

export type TermiiChannel = "dnd" | "generic" | "whatsapp";

export const TERMII_SEND_URL = "https://api.ng.termii.com/api/sms/send";

/** Termii wants international numbers without the "+": +2348031234567 → 2348031234567. */
export function toTermiiNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digits)) throw new SmsError("Invalid phone number");
  return digits;
}

export function createTermiiProvider(
  config: { apiKey: string; senderId: string; channel: TermiiChannel },
  fetchImpl: typeof fetch = fetch,
): SmsProvider {
  return {
    async send({ to, text }) {
      const response = await fetchImpl(TERMII_SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          to: toTermiiNumber(to),
          from: config.senderId,
          sms: text,
          type: "plain",
          channel: config.channel,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        message_id?: string;
        message?: string;
      } | null;
      if (!response.ok || !body?.message_id) {
        // Termii's message, never the API key or the number.
        throw new SmsError(
          `Termii responded ${response.status}: ${body?.message ?? "no message id"}`,
        );
      }
    },
  };
}
