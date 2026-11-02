import { DEFAULT_LOW_STOCK_THRESHOLD, deriveInventoryStatus } from "@/lib/inventory";

describe("deriveInventoryStatus", () => {
  it("defaults the low-stock threshold to 1 (D-2)", () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(1);
  });

  it.each([
    [0, "SOLD_OUT"],
    [-1, "SOLD_OUT"],
    [1, "LOW_STOCK"],
    [2, "AVAILABLE"],
    [10, "AVAILABLE"],
  ])("quantity %i with default threshold → %s", (quantity, expected) => {
    expect(deriveInventoryStatus(quantity)).toBe(expected);
  });

  it.each([
    [3, 3, "LOW_STOCK"],
    [4, 3, "AVAILABLE"],
    [1, 0, "AVAILABLE"],
    [0, 0, "SOLD_OUT"],
  ])("quantity %i with threshold %i → %s", (quantity, threshold, expected) => {
    expect(deriveInventoryStatus(quantity, threshold)).toBe(expected);
  });

  it("rejects non-integer quantity", () => {
    expect(() => deriveInventoryStatus(1.5)).toThrow(RangeError);
    expect(() => deriveInventoryStatus(Number.NaN)).toThrow(RangeError);
  });

  it("rejects invalid thresholds", () => {
    expect(() => deriveInventoryStatus(1, -1)).toThrow(RangeError);
    expect(() => deriveInventoryStatus(1, 0.5)).toThrow(RangeError);
  });
});
