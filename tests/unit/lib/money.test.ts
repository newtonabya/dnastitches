import {
  DEFAULT_CURRENCY,
  KOBO_PER_NAIRA,
  formatNGN,
  koboToNaira,
  nairaToKobo,
  percentOfKobo,
} from "@/lib/money";

describe("money", () => {
  it("constants", () => {
    expect(KOBO_PER_NAIRA).toBe(100);
    expect(DEFAULT_CURRENCY).toBe("NGN");
  });

  it("koboToNaira", () => {
    expect(koboToNaira(25_000_000)).toBe(250_000);
    expect(koboToNaira(1)).toBe(0.01);
    expect(koboToNaira(0)).toBe(0);
    expect(() => koboToNaira(1.5)).toThrow(RangeError);
  });

  it("nairaToKobo rounds float noise to the nearest kobo", () => {
    expect(nairaToKobo(250_000)).toBe(25_000_000);
    expect(nairaToKobo(19.99)).toBe(1999);
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
    expect(nairaToKobo(-0)).toBe(0);
    expect(Object.is(nairaToKobo(-0.001), 0)).toBe(true);
    expect(() => nairaToKobo(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => nairaToKobo(Number.NaN)).toThrow(RangeError);
  });

  it("formatNGN uses en-NG currency format (US-C4 AC6)", () => {
    expect(formatNGN(25_000_000)).toBe("₦250,000.00");
    expect(formatNGN(0)).toBe("₦0.00");
    expect(formatNGN(150)).toBe("₦1.50");
  });

  it("percentOfKobo", () => {
    expect(percentOfKobo(25_000_000, 50)).toBe(12_500_000);
    expect(percentOfKobo(333, 50)).toBe(167);
    expect(percentOfKobo(1000, 0)).toBe(0);
    expect(percentOfKobo(1000, 100)).toBe(1000);
    expect(() => percentOfKobo(1000, 101)).toThrow(RangeError);
    expect(() => percentOfKobo(1000, -1)).toThrow(RangeError);
    expect(() => percentOfKobo(10.5, 50)).toThrow(RangeError);
  });
});
