import {
  compactNaira,
  daysBetween,
  lastMonths,
  median,
  monthKey,
  monthLabel,
  monthStart,
  niceCeiling,
  parseRange,
  percent,
  rangeStart,
  sumByMonth,
} from "@/lib/analytics";

const TZ = "Africa/Lagos";

describe("analytics helpers (v1.2 US-C5)", () => {
  it("parses ranges, defaulting to 30 days", () => {
    expect(parseRange("12m")).toBe("12m");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("7y")).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });

  it("starts ranges at studio-local midnight, counting today", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(rangeStart("30d", now, TZ)).toEqual(new Date("2026-10-06T23:00:00Z")); // 7 Oct 00:00 Lagos
    expect(rangeStart("all", now, TZ)).toBeNull();
  });

  it("buckets by studio-local month with no gaps", () => {
    // 31 Oct 23:30 UTC is already 1 Nov in Lagos.
    expect(monthKey(new Date("2026-10-31T23:30:00Z"), TZ)).toBe("2026-11");
    const months = lastMonths(new Date("2026-02-10T12:00:00Z"), TZ, 4);
    expect(months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(
      sumByMonth(
        [
          { at: new Date("2025-12-05T10:00:00Z"), amountKobo: 500 },
          { at: new Date("2025-12-20T10:00:00Z"), amountKobo: 250 },
          { at: new Date("2026-02-01T10:00:00Z"), amountKobo: 100 },
          { at: new Date("2024-01-01T10:00:00Z"), amountKobo: 999 }, // outside: ignored
        ],
        months,
        TZ,
      ),
    ).toEqual([
      { month: "2025-11", amountKobo: 0 },
      { month: "2025-12", amountKobo: 750 },
      { month: "2026-01", amountKobo: 0 },
      { month: "2026-02", amountKobo: 100 },
    ]);
    expect(monthStart("2026-11", TZ)).toEqual(new Date("2026-10-31T23:00:00Z"));
    expect(monthLabel("2026-11")).toBe("Nov 2026");
    expect(monthLabel("2026-11", false)).toBe("Nov");
  });

  it("computes medians, percentages and day spans", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBeNull();
    expect(daysBetween(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-15T12:00:00Z"))).toBe(
      14.5,
    );
  });

  it("formats compact naira and nice axis ceilings", () => {
    expect(compactNaira(150_000_00)).toBe("₦150k");
    expect(compactNaira(1_250_000_00)).toBe("₦1.3M");
    expect(compactNaira(2_000_000_00)).toBe("₦2M");
    expect(compactNaira(450_50)).toBe("₦451");
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(730)).toBe(1000);
    expect(niceCeiling(180)).toBe(200);
    expect(niceCeiling(3_100_000)).toBe(5_000_000);
    expect(niceCeiling(100)).toBe(100);
  });
});
