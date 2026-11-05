import { addDays, localDateOf, zonedTimeToUtc } from "@/lib/scheduling/time";

/** Admin analytics (v1.2, US-C5): pure helpers, so the arithmetic is unit-tested. */

export const ANALYTICS_RANGES = {
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  "12m": { label: "Last 12 months", days: 365 },
  all: { label: "All time", days: null },
} as const;

export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;

export function parseRange(value: unknown): AnalyticsRange {
  return typeof value === "string" && value in ANALYTICS_RANGES ? (value as AnalyticsRange) : "30d";
}

/**
 * Start of the range: studio-local midnight `days - 1` days before today, so "last 30
 * days" means today plus the 29 days before it. Null for all time.
 */
export function rangeStart(range: AnalyticsRange, now: Date, timeZone: string): Date | null {
  const days = ANALYTICS_RANGES[range].days;
  if (days === null) return null;
  return zonedTimeToUtc(addDays(localDateOf(now, timeZone), -(days - 1)), 0, timeZone)!;
}

/** "2026-11" for the studio-local month of `date`. */
export function monthKey(date: Date, timeZone: string): string {
  return localDateOf(date, timeZone).slice(0, 7);
}

/** The last `n` month keys ending with the current one, oldest first. */
export function lastMonths(now: Date, timeZone: string, n: number): string[] {
  const [y, m] = monthKey(now, timeZone).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Studio-local midnight on the 1st of the month for a month key. */
export function monthStart(key: string, timeZone: string): Date {
  return zonedTimeToUtc(`${key}-01`, 0, timeZone)!;
}

/** Sums amounts into the given months; months with nothing are 0 (no gaps in the chart). */
export function sumByMonth(
  items: readonly { at: Date; amountKobo: number }[],
  months: readonly string[],
  timeZone: string,
): { month: string; amountKobo: number }[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const item of items) {
    const key = monthKey(item.at, timeZone);
    if (totals.has(key)) totals.set(key, totals.get(key)! + item.amountKobo);
  }
  return months.map((month) => ({ month, amountKobo: totals.get(month)! }));
}

/** "Nov 2026" / "Nov" for a month key. */
export function monthLabel(key: string, withYear = true): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(`${key}-15T00:00:00Z`));
}

/** Median of a list, or null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole-number percentage, or null when the denominator is 0 (shown as "—"). */
export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

/** "₦1.2M", "₦450k", "₦900" — compact naira for chart axes and tiles. */
export function compactNaira(kobo: number): string {
  const naira = kobo / 100;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (naira >= 1_000_000) return `₦${fmt(Math.round(naira / 100_000) / 10)}M`;
  if (naira >= 1_000) return `₦${fmt(Math.round(naira / 100) / 10)}k`;
  return `₦${Math.round(naira)}`;
}

/** A "nice" axis maximum ≥ the data maximum: 1, 2 or 5 × a power of ten. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
}
