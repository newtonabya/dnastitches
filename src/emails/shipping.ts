import type { EmailMessage } from "@/lib/email";

/** Courier emails (v1.2, US-D5): on its way, and delivered. Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");

export interface ShippingEmailInput {
  to: string;
  name: string | null;
  /** "Adire Maxi Skirt" or "Wedding gown (DNA-2026-0042)". */
  itemLabel: string;
  courierName: string;
  trackingCode: string;
  trackingUrl: string | null;
  /** Where the customer follows it on our site. */
  wardrobeUrl: string;
}

const greeting = (name: string | null) => (name ? `Hello ${name.split(" ")[0]},` : "Hello,");

export function shipmentBookedEmail(d: ShippingEmailInput): EmailMessage {
  const lines = [
    greeting(d.name),
    `Your ${d.itemLabel} is ready to travel. We've booked ${d.courierName} to collect it from the studio.`,
    `Tracking number: ${d.trackingCode}`,
    d.trackingUrl
      ? `Follow it here: ${d.trackingUrl}`
      : `Follow it in My Wardrobe: ${d.wardrobeUrl}`,
    "The courier may call the number on your delivery address, so please keep your phone close.",
    "— DNA Stitches",
  ];
  return {
    to: d.to,
    subject: `On its way: ${d.itemLabel}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}

export function shipmentDeliveredEmail(d: ShippingEmailInput): EmailMessage {
  const lines = [
    greeting(d.name),
    `${d.courierName} reports that your ${d.itemLabel} has been delivered (tracking ${d.trackingCode}).`,
    "We hope you love it. If anything isn't right, you can report it within 7 days from My Wardrobe and we'll repair or alter it free of charge.",
    `My Wardrobe: ${d.wardrobeUrl}`,
    "— DNA Stitches",
  ];
  return {
    to: d.to,
    subject: `Delivered: ${d.itemLabel}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}
