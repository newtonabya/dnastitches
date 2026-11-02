/**
 * Human-readable custom-order references (US-B1 AC6), e.g. `DNA-2026-0042`.
 * Numbering restarts each year; at least 4 digits, growing past 9999 if needed.
 */

export const REFERENCE_PREFIX = "DNA";
const REFERENCE_RE = /^DNA-(\d{4})-(\d{4,})$/;

export function formatReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999)
    throw new RangeError(`Invalid year: ${year}`);
  if (!Number.isInteger(sequence) || sequence < 1)
    throw new RangeError(`Invalid sequence: ${sequence}`);
  return `${REFERENCE_PREFIX}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function parseReference(reference: string): { year: number; sequence: number } | null {
  const match = REFERENCE_RE.exec(reference);
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}

/** Next sequence number for `year`, given the existing references for that year. */
export function nextSequence(year: number, existing: readonly string[]): number {
  let max = 0;
  for (const ref of existing) {
    const parsed = parseReference(ref);
    if (parsed && parsed.year === year && parsed.sequence > max) max = parsed.sequence;
  }
  return max + 1;
}
