import { getRouteAccess, safeCallbackUrl, signInUrl } from "@/lib/route-access";

describe("getRouteAccess", () => {
  it.each([
    ["/admin", "admin"],
    ["/admin/orders/abc", "admin"],
    ["/account", "customer"],
    ["/account/wardrobe/123", "customer"],
    ["/custom/request", "customer"],
    ["/custom/request/success", "customer"],
    ["/custom/book", "customer"],
    ["/checkout/prod_1", "customer"],
    ["/", "public"],
    ["/shop", "public"],
    ["/shop/adire-wrap-dress", "public"],
    ["/custom", "public"],
    ["/custom/gallery", "public"],
    ["/sign-in", "public"],
    ["/administrator", "public"],
    ["/accounts", "public"],
    ["/custom/requests", "public"],
  ])("%s → %s", (path, expected) => {
    expect(getRouteAccess(path)).toBe(expected);
  });
});

describe("safeCallbackUrl (US-E1 AC3)", () => {
  it.each([
    ["/account/wardrobe", "/account/wardrobe"],
    ["/custom/request?fromProduct=abc", "/custom/request?fromProduct=abc"],
    ["/shop#top", "/shop#top"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "account",
    "",
  ])("rejects %p", (input) => {
    expect(safeCallbackUrl(input, "/fallback")).toBe("/fallback");
  });

  it("falls back for null/undefined", () => {
    expect(safeCallbackUrl(null)).toBe("/");
    expect(safeCallbackUrl(undefined, "/x")).toBe("/x");
  });

  it("signInUrl encodes the callback", () => {
    expect(signInUrl("/custom/request?fromProduct=a b")).toBe(
      "/sign-in?callbackUrl=%2Fcustom%2Frequest%3FfromProduct%3Da%2520b",
    );
    expect(signInUrl("https://evil.example")).toBe("/sign-in?callbackUrl=%2F");
  });
});
