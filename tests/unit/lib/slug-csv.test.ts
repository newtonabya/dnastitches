import { csvCell, toCsv } from "@/lib/csv";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify (US-C3 AC3)", () => {
  it.each([
    ["Adire Wrap Dress", "adire-wrap-dress"],
    ["  Gold   Aso-Oke  Corset!! ", "gold-aso-oke-corset"],
    ["Café Crème & Lace", "cafe-creme-and-lace"],
    ["***", "item"],
    ["x".repeat(100), "x".repeat(80)],
  ])("%p → %p", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("uniqueSlug", () => {
  it("adds the first free numeric suffix", () => {
    expect(uniqueSlug("dress", [])).toBe("dress");
    expect(uniqueSlug("dress", ["dress"])).toBe("dress-2");
    expect(uniqueSlug("dress", ["dress", "dress-2", "dress-3"])).toBe("dress-4");
  });
});

describe("CSV (US-D2 AC4)", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Ada "Ace" Obi, Jr')).toBe('"Ada ""Ace"" Obi, Jr"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-02T10:00:00.000Z");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+234")).toBe("'+234");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("builds rows with CRLF line endings", () => {
    expect(toCsv(["email", "type"], [["a@b.co", "RESTOCK"]])).toBe(
      "email,type\r\na@b.co,RESTOCK\r\n",
    );
  });
});
