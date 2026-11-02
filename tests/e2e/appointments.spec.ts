import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectNoA11yViolations,
  signInAsAdminSlot,
  signInWithMagicLink,
  uniqueEmail,
} from "./helpers";

// Admin slot 12 is reserved for this file.

/** Pick a random free day and time, so parallel runs rarely want the same slot. */
async function pickRandomSlot(form: Locator) {
  const days = form.getByRole("group", { name: "Day" }).getByRole("radio");
  const dayCount = await days.count();
  expect(dayCount).toBeGreaterThan(0);
  // The radios are visually hidden inside their pill labels; click the pill like a user.
  const day = days.nth(Math.floor(Math.random() * dayCount));
  await day.locator("xpath=..").click();
  await expect(day).toBeChecked();
  const times = form.getByRole("group", { name: /^Time/ }).getByRole("radio");
  const timeCount = await times.count();
  expect(timeCount).toBeGreaterThan(0);
  const time = times.nth(Math.floor(Math.random() * timeCount));
  await time.locator("xpath=..").click();
  await expect(time).toBeChecked();
}

/** Submit, retrying with another random slot if a parallel test just took ours. */
async function submitWithFreeSlot(page: Page, form: Locator, button: string, done: RegExp) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await pickRandomSlot(form);
    await form.getByRole("button", { name: button }).click();
    const taken = form.getByText(/that time was just taken/);
    const outcome = await Promise.race([
      page.waitForURL(done, { timeout: 20_000 }).then(() => "done" as const),
      taken.waitFor({ timeout: 20_000 }).then(() => "taken" as const),
    ]);
    if (outcome === "done") return;
  }
  throw new Error("Couldn't find a free slot in 3 attempts");
}

test.describe("Consultation scheduler (US-F1, US-F2)", () => {
  test("a customer books and moves a consultation; the admin confirms; the customer cancels", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("booker");

    // Customer books (AC1–AC2).
    const customer = await browser.newContext();
    const me = await customer.newPage();
    await me.goto("/custom/book");
    await signInWithMagicLink(me, email);
    const form = me.getByRole("form", { name: "Book a consultation" });
    await expect(form).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(me);
    await form.getByRole("button", { name: "Request appointment" }).click();
    await expect(form.getByText("Choose a time")).toBeVisible();
    await form.getByRole("radio", { name: /Video call/ }).check();
    await submitWithFreeSlot(me, form, "Request appointment", /\/account\/appointments\?booked=1/);
    await expect(me.getByText("We've emailed you the details")).toBeVisible();
    const card = me.getByRole("article", { name: /^Consultation on / });
    await expect(card.getByTestId("appointment-status")).toHaveText("Requested");
    await expect(card.getByText("Video call")).toBeVisible();
    await expectNoA11yViolations(me);

    // Customer moves it to another time (AC5).
    await card.getByRole("link", { name: /^Move / }).click();
    const move = me.getByRole("form", { name: "Choose a new time" });
    await expect(move).toBeVisible({ timeout: 20_000 });
    await submitWithFreeSlot(me, move, "Move appointment", /\/account\/appointments\?moved=1/);
    await expect(me.getByText("Your appointment has moved.")).toBeVisible();

    // Admin confirms it (US-F2).
    await signInAsAdminSlot(page, 12, "/admin/appointments?view=list&status=REQUESTED");
    await page.getByRole("listitem").filter({ hasText: email }).getByRole("link").first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Consultation" })).toBeVisible();
    await expect(page.getByTestId("appointment-status")).toHaveText("Requested");
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByTestId("appointment-status")).toHaveText("Confirmed");
    // Not started yet, so no completed / no-show.
    await expect(page.getByRole("button", { name: "Mark completed" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Private notes" }).fill("Bring the aso-oke samples.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByText("Notes saved.")).toBeVisible();

    // The week calendar shows it.
    await page.goto("/admin/appointments");
    await expect(page.getByRole("region", { name: "Week calendar" })).toBeVisible();
    await expectNoA11yViolations(page);

    // Customer sees it confirmed, never the notes, and cancels (AC5).
    await me.reload();
    await expect(card.getByTestId("appointment-status")).toHaveText("Confirmed");
    await expect(me.getByText("Bring the aso-oke samples.")).toHaveCount(0);
    await card.getByRole("button", { name: /^Cancel / }).click();
    await card.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(me.getByText("Appointment cancelled.")).toBeVisible();
    await me.reload();
    await expect(
      me
        .getByRole("region", { name: "Past and cancelled" })
        .getByTestId("appointment-status")
        .first(),
    ).toHaveText("Cancelled");
    await customer.close();
  });

  test("the admin edits booking hours and blocks a date", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAsAdminSlot(page, 12, "/admin/settings");
    const hours = page.getByRole("region", { name: "Booking hours" });
    await expect(hours).toBeVisible();

    // Late Sunday hours (outside the seeded hours; random minutes so parallel runs differ),
    // then removed again.
    const mm = String(Math.floor(Math.random() * 60)).padStart(2, "0");
    const label = `Sunday 22:${mm}–23:${mm}`;
    const add = page.getByRole("form", { name: "Add booking hours" });
    await add.getByLabel("Day").selectOption({ label: "Sunday" });
    await add.getByLabel("From").fill(`22:${mm}`);
    await add.getByLabel("To").fill("21:00");
    await add.getByRole("button", { name: "Add hours" }).click();
    await expect(add.getByText("End must be after start")).toBeVisible();
    await add.getByLabel("To").fill(`23:${mm}`);
    await add.getByRole("button", { name: "Add hours" }).click();
    await expect(add.getByText("Hours added.")).toBeVisible();
    await expect(hours.getByText(label)).toHaveCount(1);
    await hours.getByRole("button", { name: `Remove ${label}` }).click();
    await expect(hours.getByText(label)).toHaveCount(0);

    // A date far outside the 30-day window, so parallel bookings aren't affected.
    const far = new Date(Date.now() + (200 + Math.floor(Math.random() * 300)) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const block = page.getByRole("form", { name: "Block a date" });
    await block.getByLabel("Date").fill(far);
    const reason = `E2E holiday ${mm}${Math.random().toString(36).slice(2, 6)}`;
    await block.getByLabel("Reason (optional)").fill(reason);
    await block.getByRole("button", { name: "Block date" }).click();
    await expect(block.getByText("Date blocked.")).toBeVisible();
    const blocked = hours.getByRole("list", { name: "Blocked dates" });
    await expect(blocked.getByText(reason)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("the admin books a fitting for an order, with 48 h and 3 h reminders (US-G1)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    // A customer submits a request.
    const customer = await browser.newContext();
    const me = await customer.newPage();
    await me.goto("/custom/request");
    await signInWithMagicLink(me, uniqueEmail("fitting"));
    await me.getByLabel("Title").fill("Fitting gown");
    await me.getByLabel("Description").fill("Please make it floor length with long sleeves.");
    await me.getByRole("button", { name: "Next", exact: true }).click();
    await me.getByRole("radio", { name: /Not sure/ }).click();
    await me.getByRole("button", { name: "Next", exact: true }).click();
    await me.getByLabel("Book a measurement appointment instead").check();
    await me.getByRole("button", { name: "Next", exact: true }).click();
    await me.getByRole("button", { name: "Submit request" }).click();
    const reference = (await me.getByTestId("order-reference").textContent())!.trim();
    await customer.close();

    // The admin books a fitting on the order page (random evening slot, so parallel runs differ).
    await signInAsAdminSlot(page, 12, "/admin/orders");
    const href = await page
      .getByRole("article", { name: new RegExp(`^${reference}:`) })
      .getByRole("link", { name: reference })
      .getAttribute("href");
    await page.goto(href!);
    const date = new Date(Date.now() + (5 + Math.floor(Math.random() * 20)) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const time = `${18 + Math.floor(Math.random() * 3)}:${["00", "15", "30", "45"][Math.floor(Math.random() * 4)]}`;
    await page.getByText("Book an appointment").click();
    const form = page.getByRole("form", { name: "Book an appointment" });
    await form.getByLabel("Type").selectOption({ label: "Fitting" });
    await form.getByLabel("Date").fill(date);
    await form.getByLabel(/^Time/).fill(time);
    await form.getByLabel("Length (minutes)").fill("15");
    await form.getByRole("button", { name: "Book and email the customer" }).click();
    await expect(form.getByText("Booked. The customer has been emailed an invite.")).toBeVisible();

    await page.reload();
    await page
      .getByRole("region", { name: "Appointments" })
      .getByRole("link", { name: /^Fitting/ })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Fitting" })).toBeVisible();
    await expect(page.getByTestId("appointment-status")).toHaveText("Confirmed");
    const reminders = page.getByRole("list", { name: "Reminder emails" });
    await expect(reminders.getByRole("listitem")).toHaveCount(2);
    await expect(reminders.getByText(/^48 h before/)).toBeVisible();
    await expect(reminders.getByText(/^3 h before/)).toBeVisible();
    await expectNoA11yViolations(page);

    // Cancelling removes the pending reminders (AC2).
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("appointment-status")).toHaveText("Cancelled");
    await expect(page.getByRole("region", { name: "Reminders" })).toHaveCount(0);
  });

  test("someone else's appointment can't be moved", async ({ page }) => {
    await page.goto("/custom/book?reschedule=not-mine");
    await signInWithMagicLink(page, uniqueEmail("nosy-booker"));
    await expect(
      page.getByRole("heading", { name: "This appointment can't be moved online" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
