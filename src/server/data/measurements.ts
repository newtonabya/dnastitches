import "server-only";

import type { MeasurementTakenBy, MeasurementUnit } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import type { MeasurementProfileData } from "@/lib/validators/measurements";

/**
 * Measurement profiles (US-B3, D-3). Profiles are versioned by creation: editing creates
 * a new row linked to the one it replaces, which is marked superseded. Customers see
 * only current versions; admins see the whole chain. At most one current profile per
 * user is the default, enforced inside a transaction.
 */

type Tx = Pick<PrismaClient, "measurementProfile">;
type Db = Tx & Pick<PrismaClient, "$transaction">;

export interface MeasurementProfileView {
  id: string;
  label: string;
  unit: MeasurementUnit;
  bust: number;
  waist: number;
  hips: number;
  shoulder: number | null;
  armLength: number | null;
  inseam: number | null;
  height: number | null;
  notes: string | null;
  takenBy: MeasurementTakenBy;
  isDefault: boolean;
  createdAt: Date;
  previousVersionId: string | null;
}

const n = (d: { toNumber(): number }) => d.toNumber();
const nn = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

type Row = Awaited<ReturnType<Tx["measurementProfile"]["findFirstOrThrow"]>>;

function toView(p: Row): MeasurementProfileView {
  return {
    id: p.id,
    label: p.label,
    unit: p.unit,
    bust: n(p.bust),
    waist: n(p.waist),
    hips: n(p.hips),
    shoulder: nn(p.shoulder),
    armLength: nn(p.armLength),
    inseam: nn(p.inseam),
    height: nn(p.height),
    notes: p.notes,
    takenBy: p.takenBy,
    isDefault: p.isDefault,
    createdAt: p.createdAt,
    previousVersionId: p.previousVersionId,
  };
}

function toData(data: MeasurementProfileData) {
  return {
    label: data.label,
    unit: data.unit,
    bust: data.bust,
    waist: data.waist,
    hips: data.hips,
    shoulder: data.shoulder ?? null,
    armLength: data.armLength ?? null,
    inseam: data.inseam ?? null,
    height: data.height ?? null,
    notes: data.notes ?? null,
  };
}

/** Current (non-superseded) profiles, default first then newest. */
export async function listCurrentProfiles(
  db: Tx,
  userId: string,
): Promise<MeasurementProfileView[]> {
  const rows = await db.measurementProfile.findMany({
    where: { userId, supersededAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toView);
}

/** Every version, newest first (admin Client Profile, US-C2). */
export async function listAllProfileVersions(
  db: Tx,
  userId: string,
): Promise<MeasurementProfileView[]> {
  const rows = await db.measurementProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

export async function getCurrentProfile(db: Tx, userId: string, profileId: string) {
  const row = await db.measurementProfile.findFirst({
    where: { id: profileId, userId, supersededAt: null },
  });
  return row ? toView(row) : null;
}

/**
 * Create a profile inside an existing transaction. The user's first profile, or one
 * created with `makeDefault`, becomes the only default.
 */
export async function createProfileInTx(
  tx: Tx,
  userId: string,
  data: MeasurementProfileData,
  {
    takenBy = "SELF",
    makeDefault = false,
  }: { takenBy?: MeasurementTakenBy; makeDefault?: boolean } = {},
): Promise<{ id: string }> {
  const current = await tx.measurementProfile.count({ where: { userId, supersededAt: null } });
  const isDefault = makeDefault || current === 0;
  if (isDefault) {
    await tx.measurementProfile.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }
  return tx.measurementProfile.create({
    data: { userId, ...toData(data), takenBy, isDefault },
    select: { id: true },
  });
}

export async function createProfile(
  db: Db,
  userId: string,
  data: MeasurementProfileData,
  options?: { takenBy?: MeasurementTakenBy; makeDefault?: boolean },
) {
  return db.$transaction((tx) => createProfileInTx(tx, userId, data, options));
}

export type VersionResult = { ok: true; id: string } | { ok: false; reason: "NOT_FOUND" };

/**
 * "Edit" a profile (US-B3 AC3): create a new version and supersede the old one.
 * The new version inherits default status, or takes it when `makeDefault` is set.
 */
export async function createProfileVersion(
  db: Db,
  userId: string,
  previousId: string,
  data: MeasurementProfileData,
  {
    takenBy = "SELF",
    makeDefault = false,
  }: { takenBy?: MeasurementTakenBy; makeDefault?: boolean } = {},
): Promise<VersionResult> {
  return db.$transaction(async (tx) => {
    const previous = await tx.measurementProfile.findFirst({
      where: { id: previousId, userId, supersededAt: null },
      select: { id: true, isDefault: true },
    });
    if (!previous) return { ok: false, reason: "NOT_FOUND" } as const;
    const isDefault = previous.isDefault || makeDefault;
    await tx.measurementProfile.updateMany({
      where: { userId, isDefault: true },
      data: isDefault ? { isDefault: false } : {},
    });
    await tx.measurementProfile.update({
      where: { id: previous.id },
      data: { supersededAt: new Date(), isDefault: false },
    });
    const created = await tx.measurementProfile.create({
      data: { userId, ...toData(data), takenBy, isDefault, previousVersionId: previous.id },
      select: { id: true },
    });
    return { ok: true, id: created.id } as const;
  });
}

/** Make one current profile the default (US-B3 AC2). Returns false if it isn't the user's. */
export async function setDefaultProfile(
  db: Db,
  userId: string,
  profileId: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const owned = await tx.measurementProfile.findFirst({
      where: { id: profileId, userId, supersededAt: null },
      select: { id: true },
    });
    if (!owned) return false;
    await tx.measurementProfile.updateMany({
      where: { userId, isDefault: true, NOT: { id: profileId } },
      data: { isDefault: false },
    });
    await tx.measurementProfile.update({ where: { id: profileId }, data: { isDefault: true } });
    return true;
  });
}
