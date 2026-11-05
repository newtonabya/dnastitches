import { expect, type Page, test } from "@playwright/test";

import {
  createPiece,
  expectNoA11yViolations,
  payOnDevGateway,
  signInAsAdminSlot,
  signInWithMagicLink,
  uniqueEmail,
} from "./helpers";

// Admin slot 17 is reserved for this file. The E2E server runs the simulated courier
// (COURIER_DEV=true): Lagos delivery is ₦3,000 Standard / ₦6,000 Premium.

test.describe("Courier delivery (US-D5)", () => {
  test("a customer pays the live delivery price; the admin books the courier; both see tracking", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const name = `E2E Ship ${Date.now().toString(36)}`;
    await signInAsAdminSlot(page, 17, "/admin/products/new");
    const slug = await createPiece(page, name);

    // Customer adds a Lagos address, then buys with delivery.
    const customer = await browser.newContext();
    const shopper = await customer.newPage();
    await shopper.goto("/account/profile");
    await signInWithMagicLink(shopper, uniqueEmail("shipper"));
    const addressForm = shopper
      .locator("form")
      .filter({ has: shopper.getByRole("button", { name: "Add address" }) });
    await expect(addressForm).toBeVisible({ timeout: 20_000 });
    await addressForm.getByLabel("Recipient name").fill("Ada Obi");
    await addressForm.getByLabel("Phone").fill("08031234567");
    await addressForm.getByLabel("Address line 1").fill("12 Admiralty Way");
    await addressForm.getByLabel("City / town").fill("Lekki");
    await addressForm.getByLabel("State").selectOption("Lagos");
    await addressForm.getByRole("button", { name: "Add address" }).click();
    await expect(shopper.getByRole("article", { name: "Address for Ada Obi" })).toBeVisible();

    await shopper.goto(`/checkout/${await productIdFor(page, slug)}`);
    const checkout = shopper.getByRole("form", { name: "Checkout" });
    await expect(checkout).toBeVisible({ timeout: 20_000 });
    await checkout.getByText("Deliver to me").click();
    await expect(checkout.getByText("Dev courier Standard · usually 2 days")).toBeVisible();
    await expect(shopper.getByTestId("checkout-total")).toHaveText("₦123,000.00");
    await expectNoA11yViolations(shopper);
    await checkout.getByRole("checkbox").check();
    await checkout.getByRole("button", { name: /^Pay / }).click();
    await payOnDevGateway(shopper);
    await expect(shopper).toHaveURL(/\/checkout\/success/, { timeout: 20_000 });

    // Admin books the courier from the shop order page.
    await page.goto("/admin/orders?view=shop");
    await page.getByRole("link", { name: `Courier and tracking: ${name}` }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Dev courier Standard live price")).toBeVisible();
    const book = page.getByRole("form", { name: "Book a courier" });
    await book.getByText("Dev courier Premium").click();
    await expectNoA11yViolations(page);
    await book.getByRole("button", { name: "Book courier" }).click();
    await expect(page.getByText(/Courier booked\. Tracking DEV-\d+/)).toBeVisible({
      timeout: 20_000,
    });
    await page.reload();
    const shipment = page.getByRole("article", { name: /^Shipment DEV-/ });
    await expect(shipment.getByTestId("shipment-status")).toHaveText("Courier booked");
    await expect(shipment.getByText("₦6,000.00")).toBeVisible();
    // Booked once: no second booking form.
    await expect(page.getByRole("form", { name: "Book a courier" })).toHaveCount(0);
    await expectNoA11yViolations(page);

    // The customer sees the courier and tracking number.
    await shopper.goto("/account/wardrobe");
    await expect(shopper.getByTestId("shipment-note")).toContainText(
      /Courier booked · Dev courier Premium · tracking DEV-\d+/,
    );
    await customer.close();
  });
});

/** The product id behind a slug, read from its Buy Now link. */
async function productIdFor(page: Page, slug: string) {
  await page.goto(`/shop/${slug}`);
  const href = await page.getByRole("link", { name: "Buy Now" }).getAttribute("href");
  return href!.split("/").pop()!;
}
