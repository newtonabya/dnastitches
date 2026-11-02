/**
 * Target-date rule for custom requests (US-B1 AC4): if given, the date must be at
 * least MIN_LEAD_TIME_DAYS after today, where "today" is the studio's calendar day
 * (Africa/Lagos, PRD §5.3).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar date (YYYY-MM-DD) of `now` in `timeZone`. */
export function calendarDateIn(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const match = DATE_RE.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True if `date` is a real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(date: string): boolean {
  const match = DATE_RE.exec(date);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Earliest allowed target date (YYYY-MM-DD). */
export function earliestTargetDate(now: Date, minLeadTimeDays: number, timeZone: string): string {
  return addDays(calendarDateIn(now, timeZone), minLeadTimeDays);
}

/** Validate a YYYY-MM-DD target date against the lead-time rule. */
export function isTargetDateAllowed(
  date: string,
  now: Date,
  minLeadTimeDays: number,
  timeZone: string,
): boolean {
  // ISO dates compare correctly as strings.
  return isCalendarDate(date) && date >= earliestTargetDate(now, minLeadTimeDays, timeZone);
}

/** Midday UTC on the given date, so the stored DateTime shows the same day in any African/European zone. */
export function targetDateToUtc(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}
