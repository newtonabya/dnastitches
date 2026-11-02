import { expect, test } from "@playwright/test";

import { SEED, expectNoA11yViolations } from "./helpers";

test.describe("US-A1 shop gallery", () => {
  test("shows published pieces with availability badges and no drafts", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();

    const cards = page.getByTestId("product-card");
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText(SEED.draft.name)).toHaveCount(0);

    const available = cards.filter({ hasText: SEED.available.name });
    await expect(available).toHaveAttribute("data-status", "AVAILABLE");
    await expect(available.getByText("Available")).toBeVisible();

    const lowStock = cards.filter({ hasText: SEED.lowStock.name });
    await expect(lowStock.getByText("Last One")).toBeVisible();

    const soldOut = cards.filter({ hasText: SEED.soldOut.name });
    await expect(soldOut.getByText("1-of-1 · Sold")).toBeVisible();
    await expect(soldOut.getByRole("img")).toHaveClass(/grayscale/);

    await expectNoA11yViolations(page);
  });

  test("filters by status via the query string, surviving a refresh (AC6)", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("link", { name: "Sold Out" }).click();
    await expect(page).toHaveURL(/\/shop\?status=sold-out$/);
    await expect(page.getByRole("link", { name: "Sold Out" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.reload();
    const statuses = await page
      .getByTestId("product-card")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-status")));
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses)).toEqual(new Set(["SOLD_OUT"]));

    await page.getByRole("link", { name: "Available" }).click();
    await expect(page).toHaveURL(/status=available/);
    const availableStatuses = await page
      .getByTestId("product-card")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-status")));
    expect(availableStatuses).not.toContain("SOLD_OUT");
  });
});
