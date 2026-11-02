/**
 * Highlight what changed between two measurement profile versions (US-C2 AC2).
 */

export const DIFFABLE_FIELDS = [
  "label",
  "unit",
  "bust",
  "waist",
  "hips",
  "shoulder",
  "armLength",
  "inseam",
  "height",
  "notes",
] as const;

export type DiffableField = (typeof DIFFABLE_FIELDS)[number];

export type DiffableProfile = Record<DiffableField, string | number | null>;

/** Fields whose value differs from the previous version; empty when there is no previous version. */
export function diffMeasurementProfiles(
  previous: DiffableProfile | null | undefined,
  current: DiffableProfile,
): Set<DiffableField> {
  const changed = new Set<DiffableField>();
  if (!previous) return changed;
  for (const field of DIFFABLE_FIELDS) {
    if ((previous[field] ?? null) !== (current[field] ?? null)) changed.add(field);
  }
  return changed;
}
