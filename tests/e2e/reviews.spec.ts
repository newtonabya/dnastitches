import { expect, test } from "@playwright/test";

import {
  buyWithPickup,
  createPiece,
  expectNoA11yViolations,
  signInAsAdminSlot,
  signInWithMagicLink,
  uniqueEmail,
} from "./helpers";

// Admin slot 13 is reserved for this file.

test.describe("US-H1 reviews", () => {
  test("a customer reviews a collected piece; it's public only once the admin approves it", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const name = `E2E Review ${Date.now().toString(36)}`;
    const body = `Beautiful finish and a perfect fit. ${Math.random().toString(36).slice(2, 8)}`;

    // Setup: a piece bought and picked up.
    await signInAsAdminSlot(page, 13, "/admin/products/new");
    const slug = await createPiece(page, name);
    const customer = await browser.newContext();
    const me = await customer.newPage();
    await me.goto(`/shop/${slug}`);
    await me.getByRole("link", { name: "Buy Now" }).click();
    await signInWithMagicLink(me, uniqueEmail("reviewer"));
    await buyWithPickup(me);

    // Not collected yet → no review link (AC1).
    await me.goto("/account/wardrobe");
    await expect(me.getByRole("link", { name: name, exact: true })).toBeVisible();
    await expect(me.getByRole("link", { name: `Leave a review: ${name}` })).toHaveCount(0);
    await page.goto("/admin/orders?view=shop");
    await page
      .getByLabel(`Shop order: ${name}`)
      .getByRole("button", { name: "Mark as picked up" })
      .click();
    await expect(page.getByLabel(`Shop order: ${name}`).getByText("Fulfilled")).toBeVisible();

    // Customer reviews it (AC1), with validation first.
    await me.reload();
    await me.getByRole("link", { name: `Leave a review: ${name}` }).click();
    const form = me.getByRole("form", { name: "Leave a review" });
    await expect(form).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(me);
    await form.getByLabel("Your review", { exact: true }).fill(body);
    await form.getByRole("button", { name: "Submit review" }).click();
    await expect(form.getByText("Choose a rating")).toBeVisible();
    // The radios are visually hidden inside the star labels; click the star like a user.
    await form.getByRole("radio", { name: "5 stars" }).locator("xpath=..").click();
    await expect(form.getByRole("radio", { name: "5 stars" })).toBeChecked();
    await form.getByLabel("Name to show with your review").fill("Ada E2E");
    await form.getByRole("button", { name: "Submit review" }).click();
    await expect(me).toHaveURL(/\/account\/wardrobe\?review=sent/, { timeout: 20_000 });
    await expect(me.getByText("Thank you for your review!")).toBeVisible();
    await expect(me.getByText("Review: waiting for approval")).toBeVisible();

    // Hidden until approved (AC2).
    await me.goto(`/shop/${slug}`);
    await expect(me.getByText(body)).toHaveCount(0);

    // Admin approves it.
    await page.goto("/admin/reviews");
    const card = page.getByRole("article", { name: `Review of ${name} by Ada E2E` });
    await expect(card.getByText(body)).toBeVisible();
    await expect(card.getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
    await expectNoA11yViolations(page);
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Review approved. It's now public.")).toBeVisible();

    // Public on the product page and the home page (AC3), with the chosen name only.
    await me.goto(`/shop/${slug}`);
    const reviews = me.getByRole("region", { name: "Reviews" });
    await expect(reviews.getByText(body)).toBeVisible();
    await expect(reviews.getByText(/^Ada E2E ·/)).toBeVisible();
    await me.goto("/");
    const testimonials = me.getByRole("region", { name: "What our clients say" });
    await expect(testimonials.getByText(body)).toBeVisible();
    await expectNoA11yViolations(me);

    // Hiding takes it down again.
    await page.goto("/admin/reviews?show=approved");
    await page
      .getByRole("article", { name: `Review of ${name} by Ada E2E` })
      .getByRole("button", { name: "Hide" })
      .click();
    await expect(page.getByText("Review hidden from the site.")).toBeVisible();
    await me.goto(`/shop/${slug}`);
    await expect(me.getByText(body)).toHaveCount(0);
    await customer.close();
  });
});
