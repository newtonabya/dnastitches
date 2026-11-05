import { readFile } from "node:fs/promises";

import { expect, type Page, test } from "@playwright/test";

import { e2eAdminEmail } from "../../playwright.config";

import { expectNoA11yViolations, signInWithMagicLink, uniqueEmail, useUniqueIp } from "./helpers";

// Admin slots 5–8 are reserved for this file (admin.spec.ts uses 1–3).
async function signInAsAdmin(page: Page, slot: number, to: string) {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(to)}`);
  await signInWithMagicLink(page, e2eAdminEmail(test.info().project.name, slot));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
}

test.describe("US-C3 catalog management", () => {
  test("create, publish, rename (slug kept), mark sold out, and export notify-me CSV", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const name = `E2E Gown ${Date.now().toString(36)}`;
    await signInAsAdmin(page, 5, "/admin/products/new");
    await expectNoA11yViolations(page);

    const form = page.getByRole("form", { name: "New product" });
    await form.getByRole("button", { name: "Create product" }).click();
    await expect(form.getByText("Name is required")).toBeVisible();

    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByLabel("Price (₦)").fill("150,000");
    await form.getByLabel("Quantity in stock").fill("2");
    await form.getByLabel("Description").fill("An E2E test piece.");
    await form.getByLabel("Fabric composition").fill("100% cotton");
    await form.getByLabel("Care instructions").fill("Dry clean only.");
    await form.getByLabel("Bust").fill("90");
    await form.getByLabel("Published (visible in the shop)").check();
    await form.getByRole("button", { name: "Create product" }).click();

    await expect(page.getByText("Product created and published.")).toBeVisible();
    const slug = (await page.getByText(/^\/shop\//).textContent())!.replace("/shop/", "").trim();

    // Visible in the shop straight away (cache invalidated).
    await page.goto(`/shop/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buy Now" })).toBeVisible();

    // Rename without regenerating the slug (AC3).
    await page.goBack();
    const edit = page.getByRole("form", { name: "Edit product" });
    await edit.getByLabel("Name", { exact: true }).fill(`${name} Deluxe`);
    await edit.getByRole("button", { name: "Save product" }).click();
    await expect(edit.getByText("Saved.", { exact: true })).toBeVisible();
    await page.goto(`/shop/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: `${name} Deluxe` })).toBeVisible();

    // Sold in person (AC2) → the shop shows it as sold out.
    await page.goBack();
    await page.getByRole("button", { name: "Mark as sold out" }).click();
    // The panel disappears once the piece is sold out; the badge confirms it.
    await expect(page.getByRole("main").getByText("1-of-1 · Sold")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as sold out" })).toHaveCount(0);
    await page.goto(`/shop/${slug}`);
    await expect(page.getByRole("link", { name: "Request Custom Version" })).toBeVisible();

    // A visitor joins the notify-me list…
    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await useUniqueIp(visitorPage);
    const email = uniqueEmail("csv");
    await visitorPage.goto(`/shop/${slug}`);
    await visitorPage.getByLabel("Email").fill(email);
    await visitorPage.getByRole("button", { name: "Notify me" }).click();
    await expect(visitorPage.getByText("You're on the list.", { exact: false })).toBeVisible();
    await visitor.close();

    // …and the admin exports it as CSV (US-D2 AC4).
    await page.goBack();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Notify-me requests (1)" })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`notify-requests-${slug}.csv`);
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv).toContain("email,name,type,requested_at,notified_at");
    expect(csv).toContain(`${email},,RESTOCK,`);

    // v1.2 restock auto-notify (US-D4): restocking emails the waiting customer, once.
    const restock = page.getByRole("form", { name: "Edit product" });
    await restock.getByLabel("Quantity in stock").fill("1");
    await restock.getByRole("button", { name: "Save product" }).click();
    await expect(
      restock.getByText("Saved. Emailing 1 person who asked to hear when it's back."),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(/· emailed /)).toBeVisible();
    await restock.getByRole("button", { name: "Save product" }).click();
    await expect(restock.getByText("Saved.", { exact: true })).toBeVisible();
  });

  test("edit a swatch and a portfolio item; changes show on public pages", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAdmin(page, 6, "/admin/portfolio");

    const item = page.getByRole("listitem").filter({ hasText: "Resort Linen Co-ord" });
    await item.getByText("Resort Linen Co-ord", { exact: true }).click();
    const form = item.getByRole("form", { name: "Edit Resort Linen Co-ord" });
    await form.getByLabel("Tags (comma separated)").fill("casual, linen, resort");
    await form.getByRole("button", { name: "Save item" }).click();
    await expect(form.getByText("Portfolio item saved.")).toBeVisible();

    await page.goto("/custom/gallery?tag=resort");
    await expect(page.getByRole("heading", { name: "Resort Linen Co-ord" })).toBeVisible();

    await page.goto("/admin/swatches");
    await expectNoA11yViolations(page);
    const swatch = page.getByRole("listitem").filter({ hasText: "Sand Linen" });
    await swatch.getByText("Sand Linen", { exact: true }).click();
    const swatchForm = swatch.getByRole("form", { name: "Edit Sand Linen" });
    await swatchForm.getByLabel("Composition").fill("100% linen, stone washed");
    await swatchForm.getByRole("button", { name: "Save swatch" }).click();
    await expect(swatchForm.getByText("Swatch saved.")).toBeVisible();
  });
});

test.describe("D-12 delivery zone settings", () => {
  test("warns about placeholder zones, adds and edits a zone", async ({ page }) => {
    test.setTimeout(60_000);
    await signInAsAdmin(page, 7, "/admin/settings");
    await expect(page.getByText(/placeholder fees from the seed data/)).toBeVisible();
    await expectNoA11yViolations(page);

    const zoneName = `E2E North ${Date.now().toString(36)}`;
    const add = page.getByRole("form", { name: "New delivery zone" });
    await add.getByLabel("Zone name").fill(zoneName);
    await add.getByLabel("Fee (₦)").fill("12000");
    await add.getByRole("button", { name: "Add zone" }).click();
    await expect(add.getByText("Choose at least one state")).toBeVisible();
    await add.getByLabel("Sokoto").check();
    await add.getByLabel("Zamfara").check();
    await add.getByLabel("Active (offered at checkout)").uncheck();
    await add.getByRole("button", { name: "Add zone" }).click();
    await expect(add.getByText("Zone added.")).toBeVisible();

    const zone = page.getByRole("listitem").filter({ hasText: zoneName });
    await expect(zone).toContainText("₦12,000.00");
    await expect(zone).toContainText("Inactive");
    await zone.getByText(zoneName, { exact: true }).click();
    const edit = zone.getByRole("form", { name: `Edit ${zoneName}` });
    await edit.getByLabel("Fee (₦)").fill("15000");
    await edit.getByRole("button", { name: "Save zone" }).click();
    await expect(edit.getByText("Zone saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: zoneName })).toContainText(
      "₦15,000.00",
    );
  });
});
