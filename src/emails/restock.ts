import type { EmailMessage } from "@/lib/email";
import { formatNGN } from "@/lib/money";

/** "It's back" email for notify-me restock requests (v1.2, US-D4). Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");

export interface RestockEmailInput {
  to: string;
  productName: string;
  slug: string;
  priceKobo: number;
  siteUrl: string;
}

export function restockEmail(d: RestockEmailInput): EmailMessage {
  const url = `${d.siteUrl}/shop/${d.slug}`;
  const lines = [
    `Good news: ${d.productName} is available again (${formatNGN(d.priceKobo)}).`,
    "Our pieces are made in very small numbers, so it goes to whoever checks out first.",
    `See it here: ${url}`,
    "You asked us to tell you when this piece came back. This is the only email we'll send about it.",
    "— DNA Stitches",
  ];
  return {
    to: d.to,
    subject: `It's back: ${d.productName}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}
