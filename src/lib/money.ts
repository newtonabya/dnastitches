/**
 * Money helpers. All money is stored as integer kobo (₦1 = 100 kobo) — never floats (PRD §5.3).
 */

export const KOBO_PER_NAIRA = 100;
export const DEFAULT_CURRENCY = "NGN";

const ngnFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole-naira amounts (nearly every price) read cleaner without ".00". */
const ngnWholeFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function assertKobo(kobo: number): void {
  if (!Number.isSafeInteger(kobo)) {
    throw new RangeError(`kobo must be a safe integer, got ${kobo}`);
  }
}

/** Convert integer kobo to a naira number (for display/maths only — do not persist). */
export function koboToNaira(kobo: number): number {
  assertKobo(kobo);
  return kobo / KOBO_PER_NAIRA;
}

/**
 * Convert a naira amount (e.g. from a form input) to integer kobo.
 * Rounds to the nearest kobo to absorb floating-point noise (e.g. 19.99 * 100).
 */
export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira)) {
    throw new RangeError(`naira must be a finite number, got ${naira}`);
  }
  const kobo = Math.round(naira * KOBO_PER_NAIRA);
  // Normalise -0 to 0.
  return kobo === 0 ? 0 : kobo;
}

/**
 * Format integer kobo as NGN using `en-NG` locale. Kobo are shown only when there are any.
 * @example formatNGN(25_000_000) // "₦250,000"
 * @example formatNGN(150) // "₦1.50"
 */
export function formatNGN(kobo: number): string {
  const naira = koboToNaira(kobo);
  return kobo % KOBO_PER_NAIRA === 0 ? ngnWholeFormatter.format(naira) : ngnFormatter.format(naira);
}

/** Percentage of an amount in kobo, rounded to the nearest kobo (e.g. DEPOSIT_PERCENT of a quote). */
export function percentOfKobo(kobo: number, percent: number): number {
  assertKobo(kobo);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`percent must be between 0 and 100, got ${percent}`);
  }
  return Math.round((kobo * percent) / 100);
}
