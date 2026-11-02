import {
  addDays,
  calendarDateIn,
  earliestTargetDate,
  isCalendarDate,
  isTargetDateAllowed,
  targetDateToUtc,
} from "@/lib/custom-order/lead-time";

const TZ = "Africa/Lagos";

describe("lead time (US-B1 AC4)", () => {
  it("uses the Lagos calendar day (UTC+1)", () => {
    // 23:30 UTC on 1 Nov is 00:30 on 2 Nov in Lagos.
    expect(calendarDateIn(new Date("2026-11-01T23:30:00Z"), TZ)).toBe("2026-11-02");
    expect(calendarDateIn(new Date("2026-11-01T22:59:00Z"), TZ)).toBe("2026-11-01");
  });

  it("addDays crosses months and years", () => {
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDays("2028-02-20", 10)).toBe("2028-03-01");
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });

  it("isCalendarDate rejects impossible dates", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-2-3")).toBe(false);
  });

  it("allows exactly MIN_LEAD_TIME_DAYS ahead, not a day less", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    expect(earliestTargetDate(now, 14, TZ)).toBe("2026-11-16");
    expect(isTargetDateAllowed("2026-11-16", now, 14, TZ)).toBe(true);
    expect(isTargetDateAllowed("2026-11-15", now, 14, TZ)).toBe(false);
    expect(isTargetDateAllowed("2027-06-01", now, 14, TZ)).toBe(true);
    expect(isTargetDateAllowed("2026-13-01", now, 14, TZ)).toBe(false);
  });

  it("stores the target date at midday UTC", () => {
    expect(targetDateToUtc("2026-12-01").toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });
});
