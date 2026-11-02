import { expect, type Page, test } from "@playwright/test";

import { e2eAdminEmail } from "../../playwright.config";

import { expectNoA11yViolations, signInWithMagicLink, uniqueEmail } from "./helpers";

// Admin slots 9–10 are reserved for this file. Payments run through the dev gateway
// (/dev/paystack): the E2E server has no PAYSTACK_SECRET_KEY.
async function signInAsAdmin(page: Page, slot: number, to: string) {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(to)}`);
  await signInWithMagicLink(page, e2eAdminEmail(test.info().project.name, slot));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
}

/** Creates a fresh published 1-of-1 piece so purchases never sell out the seed products. */
async function createPiece(page: Page, name: string): Promise<string> {
  await page.goto("/admin/products/new");
  const form = page.getByRole("form", { name: "New product" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (₦)").fill("120,000");
  await form.getByLabel("Quantity in stock").fill("1");
  await form.getByLabel("Description").fill("A piece bought in the payments E2E test.");
  await form.getByLabel("Fabric composition").fill("100% cotton");
  await form.getByLabel("Care instructions").fill("Dry clean only.");
  await form.getByLabel("Bust").fill("90");
  await form.getByLabel("Published (visible in the shop)").check();
  await form.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product created and published.")).toBeVisible();
  return (await page.getByText(/^\/shop\//).textContent())!.replace("/shop/", "").trim();
}

async function payOnDevGateway(page: Page) {
  await expect(page).toHaveURL(/\/dev\/paystack\?reference=dna-/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dev payment gateway" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
}

test.describe("Payments (US-A4, US-C4, US-D1)", () => {
  test("a customer buys a 1-of-1 piece and the admin marks it picked up", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const name = `E2E Buy ${Date.now().toString(36)}`;
    await signInAsAdmin(page, 9, "/admin/products/new");
    const slug = await createPiece(page, name);

    const customer = await browser.newContext();
    const shopper = await customer.newPage();
    await shopper.goto(`/shop/${slug}`);
    await shopper.getByRole("link", { name: "Buy Now" }).click();
    await signInWithMagicLink(shopper, uniqueEmail("buyer"));

    const checkout = shopper.getByRole("form", { name: "Checkout" });
    await expect(checkout).toBeVisible({ timeout: 20_000 });
    await expect(shopper.getByTestId("checkout-total")).toHaveText("₦120,000.00");
    await expectNoA11yViolations(shopper);
    // Pay stays disabled until the final-sale terms are accepted (AC4).
    const pay = checkout.getByRole("button", { name: /^Pay / });
    await expect(pay).toBeDisabled();
    await checkout.getByRole("checkbox").check();
    await pay.click();

    await payOnDevGateway(shopper);
    await expect(shopper).toHaveURL(/\/checkout\/success/, { timeout: 20_000 });
    await expect(
      shopper.getByRole("heading", { name: `Thank you! ${name} is yours.` }),
    ).toBeVisible();
    await expect(shopper.getByTestId("order-paid-total")).toHaveText("₦120,000.00");

    // Sold out for everyone else; it shows in My Wardrobe.
    await shopper.goto(`/shop/${slug}`);
    await expect(shopper.getByRole("link", { name: "Request Custom Version" })).toBeVisible();
    await shopper.goto("/account/wardrobe");
    await expect(shopper.getByRole("link", { name })).toBeVisible();
    await customer.close();

    // Admin: the paid order is in Shop orders and can be marked picked up (AC8).
    await page.goto("/admin/orders?view=shop");
    const order = page.getByLabel(`Shop order: ${name}`);
    await expect(order.getByText("Paid: to fulfil")).toBeVisible();
    await order.getByRole("button", { name: "Mark as picked up" }).click();
    await expect(order.getByText("Fulfilled", { exact: true })).toBeVisible();
    await expect(order.getByRole("button", { name: "Mark as picked up" })).toHaveCount(0);
  });

  test("a customer pays the deposit online and the order moves to In production", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const title = `E2E deposit gown ${Date.now().toString(36)}`;

    // Customer submits a request (appointment instead of measurements).
    const customer = await browser.newContext();
    const shopper = await customer.newPage();
    await shopper.goto("/custom/request");
    await signInWithMagicLink(shopper, uniqueEmail("depositor"));
    await shopper.getByLabel("Title").fill(title);
    await shopper.getByLabel("Description").fill("Floor length with long sleeves.");
    await shopper.getByRole("button", { name: "Next", exact: true }).click();
    await shopper.getByRole("radio", { name: /Not sure/ }).click();
    await shopper.getByRole("button", { name: "Next", exact: true }).click();
    await shopper.getByLabel("Book a measurement appointment instead").check();
    await shopper.getByRole("button", { name: "Next", exact: true }).click();
    await shopper.getByRole("button", { name: "Submit request" }).click();
    const reference = (await shopper.getByTestId("order-reference").textContent())!.trim();

    // Admin quotes it: Measurements taken → Awaiting deposit.
    await signInAsAdmin(page, 10, "/admin/orders");
    // Follow the card's link by URL: on narrow screens the board scrolls sideways.
    const href = await page
      .getByRole("article", { name: new RegExp(`^${reference}:`) })
      .getByRole("link", { name: reference })
      .getAttribute("href");
    await page.goto(href!);
    const status = page.getByTestId("order-status");
    const control = page.getByRole("form", { name: "Change status" });
    for (const step of ["Consultation pending", "Measurements taken"]) {
      await control.getByLabel("Move to").selectOption({ label: step });
      await control.getByRole("button", { name: "Update status" }).click();
      await expect(status).toHaveText(step);
    }
    const quote = page.getByRole("form", { name: "Quote" });
    await quote.getByLabel("Quoted price (₦)").fill("200000");
    await quote.getByRole("button", { name: "Save and send quote" }).click();
    await expect(status).toHaveText("Awaiting deposit");

    // Customer pays the deposit from My Wardrobe.
    await shopper.goto("/account/wardrobe");
    await shopper.getByRole("link", { name: new RegExp(title) }).click();
    await expect(shopper.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(shopper.getByRole("progressbar", { name: "Order progress" })).toHaveAttribute(
      "aria-valuetext",
      /Awaiting deposit/,
    );
    await expectNoA11yViolations(shopper);
    const payForm = shopper.getByRole("form", { name: "Pay deposit" });
    await payForm.getByRole("checkbox").check();
    await payForm.getByRole("button", { name: /Pay deposit/ }).click();

    await payOnDevGateway(shopper);
    await expect(shopper).toHaveURL(/\/account\/wardrobe\/.+\?payment=success/, {
      timeout: 20_000,
    });
    await expect(shopper.getByText("Payment received. Thank you!")).toBeVisible();
    await expect(shopper.getByRole("progressbar", { name: "Order progress" })).toHaveAttribute(
      "aria-valuetext",
      /In production/,
    );
    await expect(shopper.getByTestId("customer-balance-due")).toHaveText("₦100,000.00");
    await customer.close();

    // Admin sees it moved automatically, with the Paystack payment recorded.
    await page.reload();
    await expect(status).toHaveText("In production");
    await expect(page.getByText(/Deposit · Paystack · success/)).toBeVisible();
  });
});
