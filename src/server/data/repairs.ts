import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { RepairStatus } from "@/generated/prisma/enums";
import { ACTIVE_REPAIR_STATUSES, canTransitionRepair, isWithinDefectWindow } from "@/lib/repairs";
import type { RepairRequestInput, RepairUpdateInput } from "@/lib/validators/repairs";

/**
 * Defect repairs (US-D3). Plain Prisma functions; callers pass the db and the clock.
 * Repairs never create a payment or refund (AC4).
 */

type Db = PrismaClient;

export interface RepairTarget {
  kind: RepairRequestInput["kind"];
  id: string;
  /** Product name or custom order title. */
  label: string;
  /** Custom order reference (e.g. DNA-2026-0042); null for shop orders. */
  reference: string | null;
  /** Null when the piece hasn't been handed over yet. */
  handoverAt: Date | null;
  hasActiveRepair: boolean;
}

/**
 * The customer's own fulfilled shop order or completed custom order, or null.
 * Scoped by userId, so someone else's order behaves like a missing one.
 */
export async function getRepairTarget(
  db: Db,
  userId: string,
  kind: RepairRequestInput["kind"],
  targetId: string,
): Promise<RepairTarget | null> {
  const active = { where: { status: { in: [...ACTIVE_REPAIR_STATUSES] } }, select: { id: true } };
  if (kind === "ORDER") {
    const order = await db.order.findFirst({
      where: { id: targetId, userId, status: "FULFILLED" },
      select: {
        id: true,
        fulfilledAt: true,
        product: { select: { name: true } },
        repairRequests: active,
      },
    });
    if (!order) return null;
    return {
      kind,
      id: order.id,
      label: order.product.name,
      reference: null,
      handoverAt: order.fulfilledAt,
      hasActiveRepair: order.repairRequests.length > 0,
    };
  }
  const order = await db.customOrder.findFirst({
    where: { id: targetId, userId, status: "COMPLETED" },
    select: { id: true, title: true, reference: true, completedAt: true, repairRequests: active },
  });
  if (!order) return null;
  return {
    kind,
    id: order.id,
    label: order.title,
    reference: order.reference,
    handoverAt: order.completedAt,
    hasActiveRepair: order.repairRequests.length > 0,
  };
}

/** Whether "Report a defect" should be offered for this target right now (AC1). */
export function canReportDefect(target: RepairTarget, now: Date, windowDays: number): boolean {
  return !target.hasActiveRepair && isWithinDefectWindow(target.handoverAt, now, windowDays);
}

export type CreateRepairResult =
  | { ok: true; repairId: string }
  | { ok: false; code: "NOT_FOUND" | "WINDOW_CLOSED" | "ALREADY_OPEN" };

/** AC1–AC2: create an OPEN repair request, only for the owner and only inside the window. */
export async function createRepairRequest(
  db: Db,
  userId: string,
  input: RepairRequestInput,
  now: Date,
  windowDays: number,
): Promise<CreateRepairResult> {
  const target = await getRepairTarget(db, userId, input.kind, input.targetId);
  if (!target) return { ok: false, code: "NOT_FOUND" };
  if (!isWithinDefectWindow(target.handoverAt, now, windowDays))
    return { ok: false, code: "WINDOW_CLOSED" };
  if (target.hasActiveRepair) return { ok: false, code: "ALREADY_OPEN" };

  const repair = await db.repairRequest.create({
    data: {
      userId,
      orderId: input.kind === "ORDER" ? target.id : null,
      customOrderId: input.kind === "CUSTOM_ORDER" ? target.id : null,
      description: input.description,
      photoUrls: input.photoUrls,
      status: "OPEN",
    },
    select: { id: true },
  });
  return { ok: true, repairId: repair.id };
}

export type UpdateRepairResult =
  | { ok: true; changed: boolean; status: RepairStatus }
  | { ok: false; code: "NOT_FOUND" | "INVALID_TRANSITION"; from?: RepairStatus };

/**
 * AC3: admin moves a repair OPEN → IN_REPAIR → RESOLVED, or to REJECTED with a reason.
 * Saving with the same status only updates the private notes. The status write is
 * conditional on the status read, so two admins can't both move the same repair.
 */
export async function updateRepairRequest(
  db: Db,
  input: RepairUpdateInput,
  now: Date,
): Promise<UpdateRepairResult> {
  const repair = await db.repairRequest.findUnique({
    where: { id: input.repairId },
    select: { status: true },
  });
  if (!repair) return { ok: false, code: "NOT_FOUND" };

  if (input.to === repair.status) {
    await db.repairRequest.update({
      where: { id: input.repairId },
      data: { adminNotes: input.adminNotes ?? null },
    });
    return { ok: true, changed: false, status: repair.status };
  }
  if (!canTransitionRepair(repair.status, input.to))
    return { ok: false, code: "INVALID_TRANSITION", from: repair.status };

  const closing = input.to === "RESOLVED" || input.to === "REJECTED";
  const { count } = await db.repairRequest.updateMany({
    where: { id: input.repairId, status: repair.status },
    data: {
      status: input.to,
      adminNotes: input.adminNotes ?? null,
      rejectionReason: input.to === "REJECTED" ? (input.rejectionReason ?? null) : null,
      resolvedAt: closing ? now : null,
    },
  });
  if (count === 0) {
    const current = await db.repairRequest.findUnique({
      where: { id: input.repairId },
      select: { status: true },
    });
    return { ok: false, code: "INVALID_TRANSITION", from: current?.status };
  }
  return { ok: true, changed: true, status: input.to };
}

const repairItemSelect = {
  order: { select: { id: true, product: { select: { name: true, slug: true } } } },
  customOrder: { select: { id: true, reference: true, title: true } },
} as const;

/** The customer's own repairs, newest first (My Wardrobe). Admin notes are never returned. */
export async function listUserRepairs(db: Db, userId: string) {
  return db.repairRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      description: true,
      photoUrls: true,
      rejectionReason: true,
      createdAt: true,
      resolvedAt: true,
      orderId: true,
      customOrderId: true,
      ...repairItemSelect,
    },
  });
}

export type UserRepair = Awaited<ReturnType<typeof listUserRepairs>>[number];

/** Admin list, active first; optionally one status. */
export async function listAdminRepairs(db: Db, status?: RepairStatus) {
  const repairs = await db.repairRequest.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      description: true,
      photoUrls: true,
      adminNotes: true,
      rejectionReason: true,
      createdAt: true,
      resolvedAt: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      ...repairItemSelect,
    },
  });
  const rank = (s: RepairStatus) => (s === "OPEN" ? 0 : s === "IN_REPAIR" ? 1 : 2);
  return repairs.sort((a, b) => rank(a.status) - rank(b.status));
}

export type AdminRepair = Awaited<ReturnType<typeof listAdminRepairs>>[number];

/** Everything the repair emails need. */
export async function getRepairEmailData(db: Db, repairId: string) {
  const repair = await db.repairRequest.findUnique({
    where: { id: repairId },
    select: {
      id: true,
      status: true,
      description: true,
      photoUrls: true,
      rejectionReason: true,
      user: { select: { name: true, email: true } },
      ...repairItemSelect,
    },
  });
  if (!repair) return null;
  const item = repair.order
    ? repair.order.product.name
    : repair.customOrder
      ? `${repair.customOrder.title} (${repair.customOrder.reference})`
      : "your piece";
  return {
    repairId: repair.id,
    status: repair.status,
    description: repair.description,
    photoCount: repair.photoUrls.length,
    rejectionReason: repair.rejectionReason,
    customerName: repair.user.name,
    customerEmail: repair.user.email,
    item,
  };
}
