import {
  NIGERIAN_STATES,
  formatNigerianPhone,
  isNigerianState,
  normalizeNigerianPhone,
} from "@/lib/nigeria";

describe("NIGERIAN_STATES", () => {
  it("has 36 states plus FCT, unique", () => {
    expect(NIGERIAN_STATES).toHaveLength(37);
    expect(new Set(NIGERIAN_STATES).size).toBe(37);
    expect(NIGERIAN_STATES).toContain("FCT");
    expect(NIGERIAN_STATES).toContain("Lagos");
  });

  it("isNigerianState", () => {
    expect(isNigerianState("Lagos")).toBe(true);
    expect(isNigerianState("lagos")).toBe(false);
    expect(isNigerianState("Accra")).toBe(false);
  });
});

describe("normalizeNigerianPhone (PRD §5.3)", () => {
  it.each([
    ["08031234567", "+2348031234567"],
    ["0803 123 4567", "+2348031234567"],
    ["0803-123-4567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["+2348031234567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["8031234567", "+2348031234567"],
    ["(0701) 234.5678", "+2347012345678"],
    ["09161234567", "+2349161234567"],
    ["08101234567", "+2348101234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it.each([
    "",
    "0803123456",
    "080312345678",
    "06031234567",
    "08231234567",
    "+447911123456",
    "+23408031234567",
    "abc",
  ])("rejects %p", (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });

  it("formatNigerianPhone", () => {
    expect(formatNigerianPhone("+2348031234567")).toBe("0803 123 4567");
    expect(formatNigerianPhone("+15551234567")).toBe("+15551234567");
  });
});
