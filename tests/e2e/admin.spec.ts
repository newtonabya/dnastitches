import { type Browser, expect, type Page, test } from "@playwright/test";

import { e2eAdminEmail } from "../../playwright.config";

import { expectNoA11yViolations, signInWithMagicLink, uniqueEmail } from "./helpers";

/** A customer submits a minimal custom request; returns its reference and the customer's email. */
async function submitRequestAs(
  browser: Browser,
  title: string,
): Promise<{ reference: string; email: string }> {
  const email = uniqueEmail("pipeline-customer");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/custom/request");
  await signInWithMagicLink(page, email);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Please make it floor length with long sleeves.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: /Not sure/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Book a measurement appointment instead").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Submit request" }).click();
  const reference = (await page.getByTestId("order-reference").textContent())!.trim();
  await context.close();
  return { reference, email };
}

async function submitRequest(browser: Browser, title: string): Promise<string> {
  return (await submitRequestAs(browser, title)).reference;
}

/** Each test passes its own slot (1–8, unique across spec files) so parallel tests use different admin accounts. */
export async function signInAsAdmin(page: Page, slot: number) {
  await page.goto("/sign-in?callbackUrl=%2Fadmin%2Forders");
  await signInWithMagicLink(page, e2eAdminEmail(test.info().project.name, slot));
  // Generous timeout: the dev server compiles the admin routes on first use.
  await expect(page.getByRole("heading", { level: 1, name: "Custom orders" })).toBeVisible({
    timeout: 20_000,
  });
}

async function moveTo(page: Page, status: string) {
  const control = page.getByRole("form", { name: "Change status" });
  await control.getByLabel("Move to").selectOption({ label: status });
  await control.getByRole("button", { name: "Update status" }).click();
}

test.describe("Admin pipeline (US-C1, US-C4 admin side)", () => {
  test("moves a request through the whole pipeline with gates enforced", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const reference = await submitRequest(browser, "Pipeline gown");
    await signInAsAdmin(page, 1);

    // Board: the new request is in the first column; move it with the card's select.
    const card = page.getByRole("article", { name: new RegExp(`^${reference}:`) });
    await expect(
      page
        .getByTestId("column-REQUEST_RECEIVED")
        .getByRole("article", { name: new RegExp(`^${reference}:`) }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
    await card.getByRole("combobox").selectOption("CONSULTATION_PENDING");
    await expect(page.getByText(`${reference} moved to Consultation pending.`)).toBeVisible();
    await expect(
      page
        .getByTestId("column-CONSULTATION_PENDING")
        .getByRole("article", { name: new RegExp(`^${reference}:`) }),
    ).toBeVisible();

    // Detail page (by URL: on narrow screens other cards can overlap the link).
    await page.goto((await card.getByRole("link", { name: reference }).getAttribute("href"))!);
    await expect(page.getByRole("heading", { level: 1, name: reference })).toBeVisible();
    await expect(page.getByText("Customer asked to book a measurement appointment")).toBeVisible();
    await expectNoA11yViolations(page);
    const status = page.getByTestId("order-status");

    await moveTo(page, "Measurements taken");
    await expect(status).toHaveText("Measurements taken");

    // Quote → Awaiting deposit (deposit defaults to 50%).
    const quote = page.getByRole("form", { name: "Quote" });
    await quote.getByLabel("Quoted price (₦)").fill("200000");
    await expect(quote.getByLabel("Deposit (₦)")).toHaveValue("100000");
    await quote.getByRole("button", { name: "Save and send quote" }).click();
    await expect(status).toHaveText("Awaiting deposit");

    // Gate: can't start production without the deposit.
    await moveTo(page, "In production");
    await expect(page.getByText("Deposit not yet paid.")).toBeVisible();
    await expect(status).toHaveText("Awaiting deposit");

    // Offline deposit → automatically In production.
    const payment = page.getByRole("form", { name: "Record offline payment" });
    await payment.getByLabel("Amount (₦)").fill("100000");
    await payment.getByRole("button", { name: "Record payment" }).click();
    await expect(status).toHaveText("In production");
    await expect(page.getByTestId("balance-due")).toHaveText("₦100,000.00");

    await moveTo(page, "Fitting");
    await expect(status).toHaveText("Fitting");
    await moveTo(page, "Ready");
    await expect(status).toHaveText("Ready");

    // Gate: can't complete with a balance due.
    await moveTo(page, "Completed");
    await expect(
      page.getByText("Balance must be fully paid before completing the order."),
    ).toBeVisible();
    await payment.getByLabel("Type").selectOption("CUSTOM_BALANCE");
    await payment.getByLabel("Amount (₦)").fill("100000");
    await payment.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByTestId("balance-due")).toHaveText("₦0.00");
    await moveTo(page, "Completed");
    await expect(status).toHaveText("Completed");

    // Timeline shows every step.
    const timeline = page.getByRole("list", { name: "Status history" });
    for (const label of [
      "Consultation pending",
      "Measurements taken",
      "Awaiting deposit",
      "In production",
      "Fitting",
      "Ready",
      "Completed",
    ]) {
      await expect(timeline.getByText(label, { exact: true })).toBeVisible();
    }

    // Closed list and client profile.
    await page.goto("/admin/orders?view=closed&status=COMPLETED");
    await expect(page.getByRole("link", { name: reference })).toBeVisible();
  });

  test("a card can be moved with the keyboard (accessible drag and drop)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const reference = await submitRequest(browser, "Keyboard gown");
    await signInAsAdmin(page, 2);

    const handle = page.getByRole("button", { name: `Drag ${reference} to another column` });
    await handle.focus();
    // Wait for each screen-reader announcement before the next key, as a person would.
    await page.keyboard.press("Space");
    // dnd-kit's live region shows the latest announcement ("is over …" follows "Picked up …").
    await expect(page.getByText(`Order ${reference} is over Request received.`)).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(`Order ${reference} is over Consultation pending.`)).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(page.getByText(`${reference} moved to Consultation pending.`)).toBeVisible();
    await expect(
      page
        .getByTestId("column-CONSULTATION_PENDING")
        .getByRole("article", { name: new RegExp(`^${reference}:`) }),
    ).toBeVisible();
  });
});

test.describe("Admin clients (US-C2)", () => {
  test("searches clients and records measurements on their behalf", async ({ page, browser }) => {
    test.setTimeout(60_000);
    const { reference, email } = await submitRequestAs(browser, "Client gown");
    await signInAsAdmin(page, 3);

    // Search by email, then open the client profile.
    await page.goto(`/admin/clients?q=${encodeURIComponent(email)}`);
    const rows = page.getByRole("table", { name: "Clients" }).getByRole("row");
    await expect(rows).toHaveCount(2); // header + one match
    await rows.nth(1).getByRole("link").click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(reference) })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByText("Record new measurements for this client").click();
    await page.getByLabel("Label").fill("Atelier fitting");
    await page.getByLabel(/^Bust/).fill("92");
    await page.getByLabel(/^Waist/).fill("72");
    await page.getByLabel(/^Hips/).fill("100");
    await page.getByRole("button", { name: "Save measurements (taken by atelier)" }).click();
    await expect(page.getByText("Measurements recorded.")).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: /Measurements: Atelier fitting/ }),
    ).toContainText("taken by atelier");
  });

  test("customers can't reach admin actions or pages", async ({ page }) => {
    await page.goto("/sign-in");
    await signInWithMagicLink(page, uniqueEmail("not-admin-2"));
    for (const path of ["/admin/orders", "/admin/clients"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });
});
