import { addDays, localDateOf, weekdayOf, zonedTimeToUtc } from "./time";

/**
 * Bookable consultation slots (US-F1 AC1). Pure: callers pass the rules, blackout
 * dates, busy appointments and the clock, so it's fully unit-tested (incl. DST).
 */

export interface WeeklyRule {
  weekday: number; // 0 = Sunday … 6 = Saturday
  startMinute: number;
  endMinute: number;
}

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export interface Slot extends Interval {
  /** Studio-local date (YYYY-MM-DD), for grouping by day. */
  localDate: string;
}

export interface SlotOptions {
  now: Date;
  timeZone: string;
  rules: readonly WeeklyRule[];
  /** Studio-local dates (YYYY-MM-DD) with no bookings. */
  blackoutDates: readonly string[];
  /** Existing active appointments; overlapping slots are hidden. */
  busy: readonly Interval[];
  /** Appointment length; slots start every `durationMinutes` from each rule's start. */
  durationMinutes: number;
  /** How many local days ahead to offer, counting today (AC1: 30). */
  days?: number;
  /** Slots must start at least this long after `now`. */
  minNoticeMinutes?: number;
}

export const BOOKING_WINDOW_DAYS = 30;

const overlaps = (a: Interval, b: Interval) =>
  a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();

export function generateSlots({
  now,
  timeZone,
  rules,
  blackoutDates,
  busy,
  durationMinutes,
  days = BOOKING_WINDOW_DAYS,
  minNoticeMinutes = 0,
}: SlotOptions): Slot[] {
  if (durationMinutes <= 0) return [];
  const blackout = new Set(blackoutDates);
  const earliest = now.getTime() + minNoticeMinutes * 60_000;
  const today = localDateOf(now, timeZone);
  const seen = new Set<number>();
  const slots: Slot[] = [];

  for (let i = 0; i < days; i++) {
    const localDate = addDays(today, i);
    if (blackout.has(localDate)) continue;
    const weekday = weekdayOf(localDate);
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      for (
        let minute = rule.startMinute;
        minute + durationMinutes <= rule.endMinute;
        minute += durationMinutes
      ) {
        const startsAt = zonedTimeToUtc(localDate, minute, timeZone);
        if (!startsAt) continue; // skipped by a DST change
        const t = startsAt.getTime();
        if (t < earliest || seen.has(t)) continue; // too soon, or a repeated wall time
        const slot = { startsAt, endsAt: new Date(t + durationMinutes * 60_000), localDate };
        if (busy.some((b) => overlaps(slot, b))) continue;
        seen.add(t);
        slots.push(slot);
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** True when `startsAt` is exactly one of the offered slots (server-side re-check). */
export function isOfferedSlot(startsAt: Date, options: SlotOptions): Slot | null {
  return generateSlots(options).find((s) => s.startsAt.getTime() === startsAt.getTime()) ?? null;
}

export function overlapsAny(interval: Interval, busy: readonly Interval[]): boolean {
  return busy.some((b) => overlaps(interval, b));
}

/** Rules may not be empty or inverted, and must fit in one day. */
export function isValidRule(rule: WeeklyRule): boolean {
  return (
    Number.isInteger(rule.weekday) &&
    rule.weekday >= 0 &&
    rule.weekday <= 6 &&
    Number.isInteger(rule.startMinute) &&
    Number.isInteger(rule.endMinute) &&
    rule.startMinute >= 0 &&
    rule.endMinute <= 24 * 60 &&
    rule.startMinute < rule.endMinute
  );
}
