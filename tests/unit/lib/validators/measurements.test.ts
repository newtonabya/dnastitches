import { fieldErrors } from "@/lib/validators/fields";
import {
  MEASUREMENT_FIELDS,
  PLAUSIBLE_RANGES_CM,
  measurementProfileSchema,
  plausibleRange,
} from "@/lib/validators/measurements";

const valid = { label: "Wedding 2026", unit: "CM", bust: "92", waist: "74.25", hips: "100" };

describe("measurementProfileSchema (US-B3)", () => {
  it("parses strings to numbers rounded to 0.1 and drops empty optionals", () => {
    expect(measurementProfileSchema.parse({ ...valid, shoulder: "", notes: " " })).toEqual({
      label: "Wedding 2026",
      unit: "CM",
      bust: 92,
      waist: 74.3,
      hips: 100,
      shoulder: undefined,
      armLength: undefined,
      inseam: undefined,
      height: undefined,
      notes: undefined,
    });
  });

  it("requires label, unit, bust, waist and hips", () => {
    const result = measurementProfileSchema.safeParse({ label: "", unit: "XX", bust: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toMatchObject({
        label: "Label is required",
        unit: "Choose cm or inches",
        bust: "Bust / chest is required",
        waist: "Waist is required",
        hips: "Hips is required",
      });
    }
  });

  it("rejects non-numbers", () => {
    const result = measurementProfileSchema.safeParse({ ...valid, bust: "abc" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error).bust).toBe("Bust / chest must be a number");
  });

  it.each([
    ["waist", "39.9", "CM"],
    ["waist", "200.1", "CM"],
    ["bust", "10", "IN"],
    ["height", "300", "CM"],
  ])("rejects implausible %s=%s %s (AC5)", (field, value, unit) => {
    const result = measurementProfileSchema.safeParse({
      ...valid,
      unit,
      ...(unit === "IN" ? { bust: "36", waist: "29", hips: "40" } : {}),
      [field]: value,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)[field]).toMatch(/looks unusual/);
  });

  it("accepts the range boundaries", () => {
    expect(measurementProfileSchema.safeParse({ ...valid, waist: "40" }).success).toBe(true);
    expect(measurementProfileSchema.safeParse({ ...valid, waist: "200" }).success).toBe(true);
  });

  it("applies inch ranges when unit is IN", () => {
    expect(
      measurementProfileSchema.safeParse({
        ...valid,
        unit: "IN",
        bust: "36",
        waist: "29",
        hips: "40",
      }).success,
    ).toBe(true);
    // 92 inches is far outside the waist range in inches (≈15.7–78.7)
    expect(
      measurementProfileSchema.safeParse({
        ...valid,
        unit: "IN",
        bust: "36",
        waist: "92",
        hips: "40",
      }).success,
    ).toBe(false);
  });

  it("plausibleRange converts to inches", () => {
    expect(plausibleRange("waist", "CM")).toEqual(PLAUSIBLE_RANGES_CM.waist);
    expect(plausibleRange("waist", "IN")).toEqual({ min: 15.7, max: 78.7 });
  });

  it("every field has a how-to-measure helper (AC4)", () => {
    for (const f of MEASUREMENT_FIELDS) expect(f.howTo.length).toBeGreaterThan(20);
    expect(MEASUREMENT_FIELDS.map((f) => f.key).sort()).toEqual(
      Object.keys(PLAUSIBLE_RANGES_CM).sort(),
    );
  });
});
