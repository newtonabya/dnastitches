import { expect, test } from "@playwright/test";

import {
  buyWithPickup,
  createPiece,
  expectNoA11yViolations,
  signInAsAdminSlot,
  signInWithMagicLink,
  uniqueEmail,
} from "./helpers";

// Admin slot 11 is reserved for this file.

test.describe("US-D3 defect repairs", () => {
  test("a customer reports a defect and the admin moves it to In repair, then rejects it with a reason", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const name = `E2E Repair ${Date.now().toString(36)}`;

    // Setup: a piece the customer bought and has picked up.
    await signInAsAdminSlot(page, 11, "/admin/products/new");
    const slug = await createPiece(page, name);
    const customer = await browser.newContext();
    const shopper = await customer.newPage();
    await shopper.goto(`/shop/${slug}`);
    await shopper.getByRole("link", { name: "Buy Now" }).click();
    await signInWithMagicLink(shopper, uniqueEmail("repair"));
    await buyWithPickup(shopper);

    // Not handed over yet → no Report a defect.
    await shopper.goto("/account/wardrobe");
    await expect(shopper.getByRole("link", { name: name, exact: true })).toBeVisible();
    await expect(shopper.getByRole("link", { name: `Report a defect: ${name}` })).toHaveCount(0);

    await page.goto("/admin/orders?view=shop");
    await page
      .getByLabel(`Shop order: ${name}`)
      .getByRole("button", { name: "Mark as picked up" })
      .click();
    await expect(page.getByLabel(`Shop order: ${name}`).getByText("Fulfilled")).toBeVisible();

    // Customer reports the defect (AC1–AC2).
    await shopper.reload();
    await shopper.getByRole("link", { name: `Report a defect: ${name}` }).click();
    await expect(shopper.getByRole("heading", { level: 1, name: "Report a defect" })).toBeVisible();
    await expectNoA11yViolations(shopper);
    const form = shopper.getByRole("form", { name: "Report a defect" });
    await form.getByLabel("What's wrong?").fill("torn");
    await form.getByRole("button", { name: "Send report" }).click();
    await expect(form.getByText(/at least 10 characters/)).toBeVisible();
    await form
      .getByLabel("What's wrong?")
      .fill("The side seam split open the first time I wore it.");
    await form.getByRole("button", { name: "Send report" }).click();

    await expect(shopper).toHaveURL(/\/account\/wardrobe\?repair=reported/, { timeout: 20_000 });
    await expect(shopper.getByText("Thanks, we've received your report")).toBeVisible();
    const myRepair = shopper.getByRole("article", { name: `Repair request: ${name}` });
    await expect(myRepair.getByTestId("repair-status")).toHaveText("Received");
    // One open request per piece: the button is gone.
    await expect(shopper.getByRole("link", { name: `Report a defect: ${name}` })).toHaveCount(0);

    // Admin: In repair, then rejected with a reason (AC3).
    await page.goto("/admin/repairs");
    const card = page.getByRole("article", { name: `Repair: ${name}` });
    await expect(card.getByText("The side seam split open")).toBeVisible();
    await expectNoA11yViolations(page);
    await card.getByLabel("Status").selectOption({ label: "In repair" });
    await card.getByLabel("Private notes").fill("Collect on Friday.");
    await card.getByRole("button", { name: "Move to In repair" }).click();
    await expect(
      card.getByText("Moved to In repair. The customer has been emailed."),
    ).toBeVisible();
    await expect(card.getByTestId("repair-status")).toHaveText("In repair");

    await card.getByLabel("Status").selectOption({ label: "Not covered" });
    await card.getByRole("button", { name: "Move to Not covered" }).click();
    await expect(card.getByText("Give the customer a reason for the rejection")).toBeVisible();
    await card
      .getByLabel("Reason (the customer sees this)")
      .fill("The tear is from wear after handover.");
    await card.getByRole("button", { name: "Move to Not covered" }).click();
    await expect(card.getByTestId("repair-status")).toHaveText("Not covered");

    // The customer sees the outcome and reason, never the private notes.
    await shopper.reload();
    await expect(myRepair.getByTestId("repair-status")).toHaveText("Not covered");
    await expect(myRepair.getByText("Reason: The tear is from wear after handover.")).toBeVisible();
    await expect(shopper.getByText("Collect on Friday.")).toHaveCount(0);
    await customer.close();
  });

  test("the terms page states the no-refund and free-repair policy (AC4)", async ({ page }) => {
    await page.goto("/policies/terms");
    await expect(page.getByRole("heading", { name: "All sales are final" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Free repair of defects within 7 days" }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("someone else's order can't be reported", async ({ page }) => {
    await page.goto("/account/wardrobe/repair?order=not-yours");
    await signInWithMagicLink(page, uniqueEmail("nosy"));
    await expect(page.getByRole("heading", { name: /not found|couldn't find/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
