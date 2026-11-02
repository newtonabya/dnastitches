import type { EmailMessage } from "@/lib/email";
import { REPAIR_STATUS_DESCRIPTIONS, REPAIR_STATUS_LABELS } from "@/lib/repairs";

import type { RepairStatus } from "@/generated/prisma/enums";

/** Repair emails (US-D3 AC2–AC3). Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) =>
  lines.map((l) => `<p>${escapeHtml(l).replace(/\n/g, "<br>")}</p>`).join("\n");

export interface RepairEmailData {
  repairId: string;
  status: RepairStatus;
  description: string;
  photoCount: number;
  rejectionReason: string | null;
  customerName: string | null;
  customerEmail: string;
  item: string;
  siteUrl: string;
}

/** AC2: the owner hears about every new report. */
export function repairReportedOwnerEmail(to: string[], d: RepairEmailData): EmailMessage {
  const lines = [
    `${d.customerName ?? d.customerEmail} reported a defect in ${d.item}.`,
    d.description,
    `${d.photoCount} ${d.photoCount === 1 ? "photo" : "photos"} attached.`,
    `Review it: ${d.siteUrl}/admin/repairs`,
  ];
  return {
    to,
    subject: `Defect reported: ${d.item}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}

/** AC2–AC3: the customer hears when the report arrives and on every status change. */
export function repairStatusEmail(d: RepairEmailData): EmailMessage {
  const lines = [
    `Hi ${d.customerName ?? "there"},`,
    d.status === "OPEN"
      ? `We've received your defect report for ${d.item}.`
      : `Your repair request for ${d.item} is now: ${REPAIR_STATUS_LABELS[d.status]}.`,
    REPAIR_STATUS_DESCRIPTIONS[d.status],
    ...(d.status === "REJECTED" && d.rejectionReason ? [`Reason: ${d.rejectionReason}`] : []),
    "Repairs for manufacturing defects are always free of charge.",
    `Follow it in My Wardrobe: ${d.siteUrl}/account/wardrobe`,
    "— DNA Stitches",
  ];
  return {
    to: d.customerEmail,
    subject:
      d.status === "OPEN"
        ? `We've received your repair request: ${d.item}`
        : `Repair update: ${REPAIR_STATUS_LABELS[d.status]}`,
    text: lines.join("\n\n"),
    html: html(lines),
  };
}
