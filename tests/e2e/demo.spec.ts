import { expect, test } from "@playwright/test";

import { DEMO_PASSCODE, e2eAdminEmail } from "../../playwright.config";
import { uniqueEmail } from "./helpers";

// Admin slot 18 is reserved for this file. The E2E server sets DEMO_ACCESS_CODE.

test.describe("Demo sign-in (DEMO_ACCESS_CODE)", () => {
  test("a wrong passcode is refused; the right one signs in without an email", async ({ page }) => {
    await page.goto("/sign-in?callbackUrl=%2Faccount%2Fprofile");
    const demo = page.getByRole("form", { name: "Demo sign-in" });
    await expect(demo.getByText("Demo access is on.")).toBeVisible();

    await demo.getByLabel("Email").fill(uniqueEmail("demo"));
    await demo.getByLabel("Demo passcode").fill("not-the-passcode");
    await demo.getByRole("button", { name: "Sign in with demo passcode" }).click();
    await expect(demo.getByRole("alert")).toHaveText("That demo passcode isn't right.");

    const retry = page.getByRole("form", { name: "Demo sign-in" });
    await retry.getByLabel("Email").fill(uniqueEmail("demo"));
    await retry.getByLabel("Demo passcode").fill(DEMO_PASSCODE);
    await retry.getByRole("button", { name: "Sign in with demo passcode" }).click();
    await expect(page).toHaveURL(/\/account\/profile/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  });

  test("an admin email signed in by passcode gets the admin", async ({ page }, info) => {
    await page.goto("/sign-in?callbackUrl=%2Fadmin");
    const demo = page.getByRole("form", { name: "Demo sign-in" });
    await demo.getByLabel("Email").fill(e2eAdminEmail(info.project.name, 18));
    await demo.getByLabel("Demo passcode").fill(DEMO_PASSCODE);
    await demo.getByRole("button", { name: "Sign in with demo passcode" }).click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  });
});
