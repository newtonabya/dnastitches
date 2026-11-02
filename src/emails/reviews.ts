import type { EmailMessage } from "@/lib/email";
import { MAX_RATING } from "@/lib/reviews";

/** The owner's "new review to approve" email (US-H1 AC2). Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");

export function newReviewOwnerEmail(
  to: string[],
  d: { rating: number; body: string; displayName: string; item: string; siteUrl: string },
): EmailMessage {
  const stars = "★".repeat(d.rating) + "☆".repeat(MAX_RATING - d.rating);
  const lines = [
    `${d.displayName} reviewed ${d.item}: ${stars} (${d.rating}/${MAX_RATING}).`,
    d.body,
    `It stays hidden until you approve it: ${d.siteUrl}/admin/reviews`,
  ];
  return {
    to,
    subject: `New ${d.rating}-star review to approve: ${d.item}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}
