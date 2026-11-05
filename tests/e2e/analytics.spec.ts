import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, signInAsAdminSlot } from "./helpers";

// Admin slot 16 is reserved for this file.

test.describe("Analytics (v1.2 US-C5)", () => {
  test("the admin reads the figures, switches range and opens the chart's table", async ({
    page,
  }) => {
    await signInAsAdminSlot(page, 16, "/admin/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    const ranges = page.getByRole("navigation", { name: "Date range" });
    await expect(ranges.getByRole("link", { name: "Last 30 days" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("revenue-total")).toHaveText(/^₦/);
    await expect(
      page.getByRole("list", { name: "Revenue by month" }).getByRole("listitem"),
    ).toHaveCount(12);
    await expectNoA11yViolations(page);

    await ranges.getByRole("link", { name: "All time" }).click();
    await expect(page).toHaveURL(/range=all/);
    await expect(ranges.getByRole("link", { name: "All time" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.getByText("Show as a table").click();
    await expect(
      page.getByRole("table", { name: "Revenue by month" }).getByRole("row"),
    ).toHaveCount(13);
    await expect(page.getByRole("table", { name: "Custom order funnel" })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
