import type { EmailMessage } from "@/lib/email";
import { formatNGN } from "@/lib/money";

/** Payment emails (US-A4 AC6, US-C4 AC3). Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");

export interface RtwPaidData {
  customerName: string | null;
  customerEmail: string;
  productName: string;
  totalKobo: number;
  fulfillmentMethod: "PICKUP" | "DELIVERY";
  address: string | null;
  etaDays: number | null;
  studioAddress: string | null;
  studioHours: string | null;
  siteUrl: string;
}

export function rtwOrderConfirmationEmail(d: RtwPaidData): EmailMessage {
  const fulfilment =
    d.fulfillmentMethod === "PICKUP"
      ? [
          `Pickup: ${d.studioAddress ?? "we'll email you the studio address"}.`,
          d.studioHours
            ? `Opening hours: ${d.studioHours}.`
            : "We'll confirm a pickup time with you.",
        ]
      : [
          `Delivery to: ${d.address ?? "your saved address"}.`,
          d.etaDays !== null ? `Expected within ${d.etaDays} days.` : "",
        ];
  const lines = [
    `Hi ${d.customerName ?? "there"},`,
    `Thank you for your order: ${d.productName}. We've received your payment of ${formatNGN(d.totalKobo)}.`,
    ...fulfilment.filter(Boolean),
    "All sales are final. If you find a manufacturing defect within 7 days of receiving your piece, we'll repair it free of charge.",
    `Your orders: ${d.siteUrl}/account/wardrobe`,
    "— DNA Stitches",
  ];
  return {
    to: d.customerEmail,
    subject: `Order confirmed: ${d.productName}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}

export function ownerPaymentEmail(to: string[], subject: string, lines: string[]): EmailMessage {
  return { to, subject, text: lines.join("\n\n"), html: html(lines) };
}
