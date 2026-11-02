import { formatReference, nextSequence, parseReference } from "@/lib/custom-order/reference";

describe("custom-order reference (US-B1 AC6)", () => {
  it("formats DNA-YYYY-NNNN", () => {
    expect(formatReference(2026, 42)).toBe("DNA-2026-0042");
    expect(formatReference(2026, 1)).toBe("DNA-2026-0001");
    expect(formatReference(2026, 12345)).toBe("DNA-2026-12345");
  });

  it("validates inputs", () => {
    expect(() => formatReference(26, 1)).toThrow(RangeError);
    expect(() => formatReference(2026, 0)).toThrow(RangeError);
    expect(() => formatReference(2026, 1.5)).toThrow(RangeError);
  });

  it("parses and round-trips", () => {
    expect(parseReference("DNA-2026-0042")).toEqual({ year: 2026, sequence: 42 });
    expect(parseReference("DNA-2026-12345")).toEqual({ year: 2026, sequence: 12345 });
    expect(parseReference("DNA-26-1")).toBeNull();
    expect(parseReference("XYZ-2026-0001")).toBeNull();
  });

  it("nextSequence restarts each year and ignores junk", () => {
    expect(nextSequence(2026, [])).toBe(1);
    expect(nextSequence(2026, ["DNA-2026-0009", "DNA-2026-0010", "DNA-2025-0500", "junk"])).toBe(
      11,
    );
    expect(nextSequence(2027, ["DNA-2026-0010"])).toBe(1);
  });
});
