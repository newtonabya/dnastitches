import type { EmailMessage } from "@/lib/email";
import { formatNGN } from "@/lib/money";
import { APPOINTMENT_TYPE_LABELS } from "@/lib/scheduling/appointments";

import { formatAppointmentTime } from "./appointments";

/** Fitting and pickup reminder emails (US-G1). Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");

export interface ReminderEmailInput {
  type: "CONSULTATION" | "MEASUREMENT" | "FITTING" | "PICKUP";
  mode: "IN_STUDIO" | "VIDEO";
  startsAt: Date;
  endsAt: Date;
  customerName: string | null;
  customerEmail: string;
  orderLabel: string | null;
  orderId: string | null;
  balanceDueKobo: number;
  timeZone: string;
  studioAddress: string | null;
  siteUrl: string;
}

export function reminderEmail(d: ReminderEmailInput): EmailMessage {
  const type = APPOINTMENT_TYPE_LABELS[d.type].toLowerCase();
  const when = formatAppointmentTime(d.startsAt, d.endsAt, d.timeZone);
  const where =
    d.mode === "VIDEO"
      ? "Video call: we'll email you the link."
      : `At the studio${d.studioAddress ? `: ${d.studioAddress}` : ""}`;
  const lines = [
    `Hi ${d.customerName ?? "there"},`,
    `A reminder about your ${type}${d.orderLabel ? ` for ${d.orderLabel}` : ""}.`,
    `When: ${when}`,
    `Where: ${where}`,
    ...(d.type === "FITTING"
      ? ["Please wear or bring the shoes and undergarments you plan to wear with the piece."]
      : []),
    ...(d.type === "PICKUP" && d.balanceDueKobo > 0
      ? [
          `Balance due before pickup: ${formatNGN(d.balanceDueKobo)}. You can pay online: ${d.siteUrl}/account/wardrobe${d.orderId ? `/${d.orderId}` : ""}`,
        ]
      : []),
    `Need to change it? Reply to this email or see your appointments: ${d.siteUrl}/account/appointments`,
    "— DNA Stitches",
  ];
  return {
    to: d.customerEmail,
    subject: `Reminder: your ${type}, ${when.split(",").slice(0, 2).join(",")}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}
