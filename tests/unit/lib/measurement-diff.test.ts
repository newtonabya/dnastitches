import { type DiffableProfile, diffMeasurementProfiles } from "@/lib/measurement-diff";

const v1: DiffableProfile = {
  label: "Wedding",
  unit: "CM",
  bust: 90,
  waist: 70,
  hips: 98,
  shoulder: null,
  armLength: null,
  inseam: null,
  height: null,
  notes: null,
};

describe("diffMeasurementProfiles (US-C2 AC2)", () => {
  it("returns no changes without a previous version", () => {
    expect(diffMeasurementProfiles(null, v1).size).toBe(0);
  });

  it("returns exactly the changed fields", () => {
    expect(
      [
        ...diffMeasurementProfiles(v1, { ...v1, waist: 72, shoulder: 40, notes: "after fitting" }),
      ].sort(),
    ).toEqual(["notes", "shoulder", "waist"]);
    expect(diffMeasurementProfiles(v1, { ...v1 }).size).toBe(0);
  });
});
