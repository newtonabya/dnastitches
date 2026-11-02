import {
  SHOP_PAGE_SIZE,
  STATUSES_FOR_FILTER,
  pageCount,
  parseShopFilters,
  shopHref,
} from "@/lib/shop";

describe("parseShopFilters (US-A1 AC6)", () => {
  it("defaults to all / page 1", () => {
    expect(parseShopFilters({})).toEqual({ status: "all", page: 1 });
  });

  it.each([
    [{ status: "available" }, { status: "available", page: 1 }],
    [
      { status: "SOLD-OUT", page: "3" },
      { status: "sold-out", page: 3 },
    ],
    [{ status: ["available", "sold-out"] }, { status: "available", page: 1 }],
    [
      { status: "bogus", page: "0" },
      { status: "all", page: 1 },
    ],
    [{ page: "-2" }, { status: "all", page: 1 }],
    [{ page: "1.5" }, { status: "all", page: 1 }],
    [{ page: "abc" }, { status: "all", page: 1 }],
  ])("%j → %j", (input, expected) => {
    expect(parseShopFilters(input)).toEqual(expected);
  });
});

describe("shopHref", () => {
  it("omits defaults", () => {
    expect(shopHref({})).toBe("/shop");
    expect(shopHref({ status: "all", page: 1 })).toBe("/shop");
  });
  it("includes non-default values", () => {
    expect(shopHref({ status: "sold-out" })).toBe("/shop?status=sold-out");
    expect(shopHref({ status: "available", page: 2 })).toBe("/shop?status=available&page=2");
    expect(shopHref({ page: 4 })).toBe("/shop?page=4");
  });
});

describe("filters and paging", () => {
  it("Available includes Last One pieces; Sold Out only sold out", () => {
    expect(STATUSES_FOR_FILTER.available).toEqual(["AVAILABLE", "LOW_STOCK"]);
    expect(STATUSES_FOR_FILTER["sold-out"]).toEqual(["SOLD_OUT"]);
    expect(STATUSES_FOR_FILTER.all).toHaveLength(3);
  });

  it("24 per page, minimum one page", () => {
    expect(SHOP_PAGE_SIZE).toBe(24);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(24)).toBe(1);
    expect(pageCount(25)).toBe(2);
    expect(pageCount(10, 3)).toBe(4);
  });
});
