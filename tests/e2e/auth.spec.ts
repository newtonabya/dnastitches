import { expect, test } from "@playwright/test";

import { expectNoA11yViolations, signInWithMagicLink, uniqueEmail } from "./helpers";

test.describe("US-E1 sign in and profile", () => {
  test("signed-out visitors are sent to sign in, then land on the callback URL", async ({
    page,
  }) => {
    await page.goto("/account/profile");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Faccount%2Fprofile$/);
    await expectNoA11yViolations(page);

    await signInWithMagicLink(page, uniqueEmail("signin"));
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("rejects off-site callback URLs", async ({ page }) => {
    await page.goto("/sign-in?callbackUrl=https%3A%2F%2Fevil.example%2F");
    await signInWithMagicLink(page, uniqueEmail("evil"));
    await expect(page).toHaveURL(/localhost:\d+\/account\/wardrobe$/);
  });

  test("updates name and phone (stored as +234) and manages addresses (AC4)", async ({ page }) => {
    await page.goto("/account/profile");
    await signInWithMagicLink(page, uniqueEmail("profile"));
    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();

    const details = page.getByRole("region", { name: "Your details" });
    await details.getByLabel("Name").fill("Ada Obi");
    await details.getByLabel("Phone").fill("12345");
    await details.getByRole("button", { name: "Save profile" }).click();
    await expect(details.getByText(/Enter a valid Nigerian mobile number/)).toBeVisible();
    await expect(details.getByLabel("Name")).toHaveValue("Ada Obi");

    await details.getByLabel("Phone").fill("+234 803 123 4567");
    await details.getByRole("button", { name: "Save profile" }).click();
    await expect(details.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(details.getByLabel("Name")).toHaveValue("Ada Obi");
    await expect(details.getByLabel("Phone")).toHaveValue("0803 123 4567");

    const addressForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add address" }) });
    await addressForm.getByLabel("Recipient name").fill("Ada Obi");
    await addressForm.getByLabel("Phone").fill("08031234567");
    await addressForm.getByLabel("Address line 1").fill("12 Admiralty Way");
    await addressForm.getByLabel("City / town").fill("Lekki");
    await addressForm.getByLabel("State").selectOption("Lagos");
    await addressForm.getByRole("button", { name: "Add address" }).click();

    const card = page.getByRole("article", { name: "Address for Ada Obi" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Default")).toBeVisible();
    await expectNoA11yViolations(page);

    await card.getByRole("button", { name: "Delete" }).click();
    await expect(card).toHaveCount(0);
  });

  test("customers get a 404 on /admin (D-4)", async ({ page }) => {
    await page.goto("/sign-in");
    await signInWithMagicLink(page, uniqueEmail("not-admin"));
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
