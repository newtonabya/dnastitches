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
