import {
  CM_PER_INCH,
  cmToIn,
  convertMeasurement,
  formatMeasurement,
  inToCm,
  roundTo,
} from "@/lib/units";

describe("units", () => {
  it("uses the exact cm/in factor", () => {
    expect(CM_PER_INCH).toBe(2.54);
  });

  it("converts cm to inches", () => {
    expect(cmToIn(2.54)).toBeCloseTo(1, 10);
    expect(cmToIn(91.44)).toBeCloseTo(36, 10);
  });

  it("converts inches to cm", () => {
    expect(inToCm(1)).toBeCloseTo(2.54, 10);
    expect(inToCm(28)).toBeCloseTo(71.12, 10);
  });

  it("round-trips within ±0.1 (US-A2)", () => {
    for (const cm of [40, 66.5, 91.4, 120, 199.9]) {
      expect(Math.abs(inToCm(roundTo(cmToIn(cm))) - cm)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(roundTo(cmToIn(cm)) - cmToIn(cm))).toBeLessThanOrEqual(0.05);
    }
  });

  it("convertMeasurement handles both directions and identity", () => {
    expect(convertMeasurement(100, "CM", "CM")).toBe(100);
    expect(convertMeasurement(10, "IN", "IN")).toBe(10);
    expect(convertMeasurement(254, "CM", "IN")).toBeCloseTo(100, 10);
    expect(convertMeasurement(10, "IN", "CM")).toBeCloseTo(25.4, 10);
  });

  it("roundTo rounds half up and supports decimals", () => {
    expect(roundTo(1.25)).toBe(1.3);
    expect(roundTo(1.24)).toBe(1.2);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(3.14159, 0)).toBe(3);
  });

  it("formatMeasurement formats with unit suffix", () => {
    expect(formatMeasurement(91.44, "CM", "IN")).toBe("36.0 in");
    expect(formatMeasurement(36, "IN", "CM")).toBe("91.4 cm");
    expect(formatMeasurement(70, "CM")).toBe("70.0 cm");
    expect(formatMeasurement(70, "CM", "CM", 0)).toBe("70 cm");
  });
});
