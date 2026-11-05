import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("home page renders the brand and primary calls to action", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/DNA Stitches/);
    await expect(page.getByRole("heading", { level: 1, name: "DNA Stitches" })).toBeVisible();
    await expect(page.getByText("According to Ur DNA")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Shop Ready-to-Wear/ })).toHaveAttribute(
      "href",
      "/shop",
    );
    await expect(page.getByRole("link", { name: /^Bespoke Tailoring/ })).toHaveAttribute(
      "href",
      "/custom",
    );
  });
});

test.describe("app-style navigation", () => {
  test("the shop leads with the bespoke fitting banner", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("link", { name: /Book a Bespoke Fitting/ })).toHaveAttribute(
      "href",
      "/custom/book",
    );
  });

  test("phones get a bottom tab bar; larger screens use the header", async ({ page, isMobile }) => {
    await page.goto("/shop");
    const tabs = page.getByRole("navigation", { name: "App" });
    if (!isMobile) {
      await expect(tabs).toBeHidden();
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      return;
    }
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(tabs.getByRole("link")).toHaveText(["Home", "Shop", "Tailoring", "Profile"]);
    await expect(tabs.getByRole("link", { name: "Shop" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Tailoring" }).click();
    await expect(page).toHaveURL(/\/custom$/);
    await expect(tabs.getByRole("link", { name: "Tailoring" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
