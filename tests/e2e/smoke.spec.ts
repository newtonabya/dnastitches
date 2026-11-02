import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("home page renders the brand and primary calls to action", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/DNA Stitches/);
    await expect(page.getByRole("heading", { level: 1, name: "DNA Stitches" })).toBeVisible();
    await expect(page.getByText("Tailored to your DNA.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop 1-of-1 pieces" })).toHaveAttribute(
      "href",
      "/shop",
    );
    await expect(page.getByRole("link", { name: "Start a custom piece" })).toHaveAttribute(
      "href",
      "/custom",
    );
  });
});
