/**
 * Time-zone helpers built on Intl only (no dependency). The studio's calendar lives in
 * STUDIO_TIMEZONE; everything is stored in UTC. A "local date" is an ISO date string
 * (YYYY-MM-DD) in the studio's zone; a "local minute" is minutes after local midnight.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock time in `timeZone` at `instant`. */
export function wallTimeIn(instant: Date, timeZone: string): WallTime {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (e.g. +1 h for Lagos). */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const w = wallTimeIn(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD; null if malformed or not a real date. */
export function parseLocalDate(value: string): { year: number; month: number; day: number } | null {
  if (!LOCAL_DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  return { year, month, day };
}

/** The studio-local calendar date of `instant`. */
export function localDateOf(instant: Date, timeZone: string): string {
  const w = wallTimeIn(instant, timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Calendar arithmetic on local dates (time-zone independent). */
export function addDays(localDate: string, days: number): string {
  const p = parseLocalDate(localDate);
  if (!p) throw new Error(`Invalid local date: ${localDate}`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(localDate: string): number {
  const p = parseLocalDate(localDate);
  if (!p) throw new Error(`Invalid local date: ${localDate}`);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/**
 * The UTC instant of a studio-local wall time, or null when that wall time doesn't
 * exist (skipped by a DST change). For a wall time that happens twice (clocks going
 * back), the earlier instant is returned.
 */
export function zonedTimeToUtc(
  localDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date | null {
  const p = parseLocalDate(localDate);
  if (!p || minuteOfDay < 0 || minuteOfDay >= 24 * 60) return null;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const naive = Date.UTC(p.year, p.month - 1, p.day, hour, minute);
  // Try both offsets around the instant: the earlier valid match wins.
  const candidates = [
    naive - zoneOffsetMs(new Date(naive - 12 * 3600_000), timeZone),
    naive - zoneOffsetMs(new Date(naive + 12 * 3600_000), timeZone),
  ].sort((a, b) => a - b);
  for (const t of candidates) {
    const w = wallTimeIn(new Date(t), timeZone);
    if (
      w.year === p.year &&
      w.month === p.month &&
      w.day === p.day &&
      w.hour === hour &&
      w.minute === minute
    )
      return new Date(t);
  }
  return null;
}

/** Minutes after local midnight of `instant` in `timeZone`. */
export function localMinuteOf(instant: Date, timeZone: string): number {
  const w = wallTimeIn(instant, timeZone);
  return w.hour * 60 + w.minute;
}

/** "10:00" ↔ 600. */
export function formatMinute(minuteOfDay: number): string {
  return `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

export function parseMinute(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Monday of the week containing `localDate` (studio weeks start on Monday). */
export function startOfWeek(localDate: string): string {
  return addDays(localDate, -((weekdayOf(localDate) + 6) % 7));
}
