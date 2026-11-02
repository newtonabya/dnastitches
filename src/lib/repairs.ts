import type { RepairStatus } from "@/generated/prisma/enums";

/**
 * Defect repairs (US-D3, D-13). Pure rules shared by the UI, Server Actions and tests.
 */

export const DEFAULT_REPAIR_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the defect window closes: exactly `days` × 24 h after handover. */
export function defectWindowEndsAt(
  handoverAt: Date,
  days: number = DEFAULT_REPAIR_WINDOW_DAYS,
): Date {
  return new Date(handoverAt.getTime() + days * DAY_MS);
}

/**
 * True while a defect may be reported: from handover up to and including exactly
 * `days` × 24 h later (AC1). A missing handover date (not yet handed over) is never within.
 */
export function isWithinDefectWindow(
  handoverAt: Date | null | undefined,
  now: Date,
  days: number = DEFAULT_REPAIR_WINDOW_DAYS,
): boolean {
  if (!handoverAt) return false;
  const t = now.getTime();
  return t >= handoverAt.getTime() && t <= defectWindowEndsAt(handoverAt, days).getTime();
}

/** OPEN → IN_REPAIR → RESOLVED, or REJECTED (with a reason) from OPEN or IN_REPAIR (AC3). */
export const REPAIR_TRANSITIONS: Record<RepairStatus, readonly RepairStatus[]> = {
  OPEN: ["IN_REPAIR", "REJECTED"],
  IN_REPAIR: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};

export function canTransitionRepair(from: RepairStatus, to: RepairStatus): boolean {
  return REPAIR_TRANSITIONS[from].includes(to);
}

/** Statuses where the repair is still being handled. */
export const ACTIVE_REPAIR_STATUSES = ["OPEN", "IN_REPAIR"] as const satisfies RepairStatus[];

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  OPEN: "Received",
  IN_REPAIR: "In repair",
  RESOLVED: "Repaired",
  REJECTED: "Not covered",
};

/** One-line explanation for the customer (My Wardrobe and emails). */
export const REPAIR_STATUS_DESCRIPTIONS: Record<RepairStatus, string> = {
  OPEN: "We've received your report and will be in touch about getting the piece to us.",
  IN_REPAIR: "Your piece is being repaired, free of charge.",
  RESOLVED: "The repair is done.",
  REJECTED: "We couldn't cover this under the defect policy.",
};
