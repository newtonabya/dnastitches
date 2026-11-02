import { expect, test } from "@playwright/test";

import { SEED, expectNoA11yViolations, uniqueEmail, useUniqueIp } from "./helpers";

test.describe("US-A2 product detail", () => {
  test("available piece: details, Buy Now, metadata and structured data", async ({ page }) => {
    await page.goto(`/shop/${SEED.available.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: SEED.available.name })).toBeVisible();
    await expect(page).toHaveTitle(`${SEED.available.name} · DNA Stitches`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /placehold\.co/,
    );
    await expect(page.getByText("₦185,000.00")).toBeVisible();
    await expect(page.getByRole("link", { name: "Buy Now" })).toHaveAttribute(
      "href",
      /\/checkout\//,
    );
    await expect(page.getByRole("link", { name: "Request Custom Version" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fabric & care" })).toBeVisible();

    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    );
    expect(ld).toMatchObject({
      "@type": "Product",
      name: SEED.available.name,
      offers: { priceCurrency: "NGN" },
    });

    await expectNoA11yViolations(page);
  });

  test("cm/in toggle converts and persists for the session (AC2)", async ({ page }) => {
    await page.goto(`/shop/${SEED.available.slug}`);
    const bust = page.getByTestId("spec-bust");
    await expect(bust).toHaveText("88.0 cm");
    // Retry the click: on a busy dev server it can land before the toggle has hydrated.
    await expect(async () => {
      await page.getByRole("button", { name: "in", exact: true }).click();
      await expect(bust).toHaveText("34.6 in", { timeout: 1_000 });
    }).toPass();

    await page.goto(`/shop/${SEED.lowStock.slug}`);
    await expect(page.getByRole("button", { name: "in", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("spec-bust")).toHaveText(/ in$/);
  });

  test("unknown or unpublished slugs show the 404 page (AC4)", async ({ page }) => {
    for (const slug of ["does-not-exist", SEED.draft.slug]) {
      await page.goto(`/shop/${slug}`);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
  });
});

test.describe("US-A3 / US-D2 sold-out piece", () => {
  test("replaces Buy with Request Custom Version and a notify-me form", async ({ page }) => {
    await page.goto(`/shop/${SEED.soldOut.slug}`);
    await expect(page.getByRole("link", { name: "Buy Now" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Request Custom Version" })).toHaveAttribute(
      "href",
      /\/custom\/request\?fromProduct=/,
    );
    await expect(page.getByRole("button", { name: "Notify me" })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("Request Custom Version sends visitors to sign in with the callback kept (US-A3 AC2)", async ({
    page,
  }) => {
    await page.goto(`/shop/${SEED.soldOut.slug}`);
    await page.getByRole("link", { name: "Request Custom Version" }).click();
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fcustom%2Frequest%3FfromProduct%3D/);
  });

  test("notify me validates, succeeds, and is idempotent (AC2–3)", async ({ page }) => {
    await useUniqueIp(page);
    await page.goto(`/shop/${SEED.soldOut.slug}`);
    const email = page.getByLabel("Email");

    await email.fill("not-an-email");
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(email).toHaveValue("not-an-email");

    const address = uniqueEmail("notify");
    await email.fill(address);
    await page.getByLabel("Similar fabric").check();
    await page.getByRole("button", { name: "Notify me" }).click();
    const success = page.getByRole("status").filter({ hasText: "You're on the list." });
    await expect(success).toBeVisible();

    await page.reload();
    await page.getByLabel("Email").fill(address);
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(success).toBeVisible();
  });
});
