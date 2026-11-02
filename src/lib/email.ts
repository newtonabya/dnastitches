import "server-only";

import { env } from "@/lib/env";

/**
 * Email provider abstraction (PRD §9, G1 DoD): Resend in production; in development
 * without RESEND_API_KEY the message is logged instead of sent. Failures are logged
 * without recipient details (NFR-3: no PII in logs) and never thrown, so an email
 * outage can't fail the user's action.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const resendSender = (apiKey: string, from: string): EmailSender => ({
  async send({ to, subject, text, html }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to].flat(), subject, text, html }),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  },
});

const consoleSender: EmailSender = {
  async send({ to, subject, text }) {
    console.info(`\n[email] To: ${[to].flat().join(", ")}\nSubject: ${subject}\n\n${text}\n`);
  },
};

export function getEmailSender(): EmailSender {
  if (env.RESEND_API_KEY) {
    return resendSender(
      env.RESEND_API_KEY,
      env.EMAIL_FROM ?? "DNA Stitches <onboarding@resend.dev>",
    );
  }
  return consoleSender;
}

export async function sendEmail(
  message: EmailMessage,
  sender: EmailSender = getEmailSender(),
): Promise<boolean> {
  try {
    await sender.send(message);
    return true;
  } catch (error) {
    console.error(
      `[email] Failed to send "${message.subject}":`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
