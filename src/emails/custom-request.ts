import type { EmailMessage } from "@/lib/email";

/**
 * Custom request emails (US-B1 AC6). Plain-text first; HTML is a minimal
 * escaped rendering of the same content.
 */

export interface CustomRequestEmailData {
  reference: string;
  title: string;
  customerName: string | null;
  customerEmail: string;
  siteUrl: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toHtml(lines: string[]): string {
  return lines.map((l) => (l ? `<p>${escapeHtml(l)}</p>` : "")).join("\n");
}

export function customerConfirmationEmail(d: CustomRequestEmailData): EmailMessage {
  const lines = [
    `Hi ${d.customerName ?? "there"},`,
    `Thank you for your custom request "${d.title}". Your reference is ${d.reference}.`,
    "We'll review it and get back to you to arrange a consultation. You can follow progress in My Wardrobe:",
    `${d.siteUrl}/account/wardrobe`,
    "— DNA Stitches",
  ];
  return {
    to: d.customerEmail,
    subject: `We've received your custom request ${d.reference}`,
    text: lines.join("\n\n"),
    html: toHtml(lines),
  };
}

export function ownerNotificationEmail(d: CustomRequestEmailData, to: string[]): EmailMessage {
  const lines = [
    `New custom request ${d.reference}: "${d.title}"`,
    `From: ${d.customerName ?? "(no name)"} <${d.customerEmail}>`,
    `Review it in the admin pipeline: ${d.siteUrl}/admin/orders`,
  ];
  return {
    to,
    subject: `New custom request ${d.reference}`,
    text: lines.join("\n\n"),
    html: toHtml(lines),
  };
}
