import { expect, type Page, test } from "@playwright/test";

import { SEED, expectNoA11yViolations, signInWithMagicLink, uniqueEmail } from "./helpers";

async function fillNewMeasurements(page: Page, label: string) {
  await page.getByLabel("Enter new measurements").check();
  await page.getByLabel("Label").fill(label);
  await page.getByLabel(/^Bust/).fill("90");
  await page.getByLabel(/^Waist/).fill("70");
  await page.getByLabel(/^Hips/).fill("98");
}

test.describe("Custom journey", () => {
  test("sold-out → Request Custom Version → sign in → pre-filled request → submitted (US-A3, US-B1)", async ({
    page,
  }) => {
    await page.goto(`/shop/${SEED.soldOut.slug}`);
    await page.getByRole("link", { name: "Request Custom Version" }).click();
    await signInWithMagicLink(page, uniqueEmail("custom-sold"));

    // Returned to the pre-filled form (callbackUrl preserved).
    await expect(page).toHaveURL(/\/custom\/request\?fromProduct=/);
    await expect(page.getByLabel("Title")).toHaveValue(`Custom version of ${SEED.soldOut.name}`);
    await expect(page.getByRole("img", { name: "Reference image 1" })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByLabel("Description").fill("Same silhouette but ankle length, please.");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByRole("radio", { name: new RegExp(SEED.soldOutSwatch) })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await fillNewMeasurements(page, "Wedding 2026");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Review & submit" })).toBeVisible();
    await page.getByRole("button", { name: "Submit request" }).click();

    await expect(page).toHaveURL(/\/custom\/request\/success\?ref=DNA-\d{4}-\d{4,}/);
    await expect(page.getByTestId("order-reference")).toHaveText(/^DNA-\d{4}-\d{4,}$/);

    // The new measurements were saved for reuse (US-B1 AC5).
    await page.goto("/account/measurements");
    await expect(page.getByRole("article", { name: "Measurements: Wedding 2026" })).toBeVisible();
  });

  test("portfolio → I want something like this → submitted with an appointment (US-B2)", async ({
    page,
  }) => {
    await page.goto("/custom/gallery");
    await expect(page.getByRole("heading", { level: 1, name: "Portfolio" })).toBeVisible();
    await expectNoA11yViolations(page);

    await page
      .getByRole("navigation", { name: "Filter by tag" })
      .getByRole("link", { name: "bridal", exact: true })
      .click();
    await expect(page).toHaveURL(/tag=bridal/);
    await page
      .getByRole("link", {
        name: new RegExp(`I want something like this\\s*: ${SEED.portfolio.title}`),
      })
      .click();
    await signInWithMagicLink(page, uniqueEmail("custom-portfolio"));

    await expect(page.getByLabel("Title")).toHaveValue(`Inspired by ${SEED.portfolio.title}`);
    await page.getByLabel("Description").fill("Something like this for my traditional wedding.");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("radio", { name: /Not sure/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Book a measurement appointment instead").check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByTestId("order-reference")).toHaveText(/^DNA-/);
  });

  test("an unknown fromPortfolio shows a dismissible notice and a blank form (US-B2 AC5)", async ({
    page,
  }) => {
    await page.goto("/custom/request?fromPortfolio=nope");
    await signInWithMagicLink(page, uniqueEmail("custom-notice"));
    await expect(page.getByText("We couldn't find the piece you came from")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("We couldn't find the piece you came from")).toHaveCount(0);
  });

  test("target date must respect the lead time (US-B1 AC4)", async ({ page }) => {
    await page.goto("/custom/request");
    await signInWithMagicLink(page, uniqueEmail("custom-date"));
    await page.getByLabel("Title").fill("Gown");
    await page.getByLabel("Description").fill("A long description of the gown.");
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Target date — optional").fill(tomorrow);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(/We need at least 14 days/)).toBeVisible();
  });
});

test.describe("US-B3 measurement profiles", () => {
  test("add, edit as a new version, and set default", async ({ page }) => {
    await page.goto("/account/measurements");
    await signInWithMagicLink(page, uniqueEmail("measure"));
    await expect(page.getByRole("heading", { level: 1, name: "My measurements" })).toBeVisible();

    const add = page.getByRole("region", { name: "Add measurements" });
    await add.getByLabel("Label").fill("Everyday");
    await add.getByLabel(/^Bust/).fill("90");
    await add.getByLabel(/^Waist/).fill("30");
    await add.getByLabel(/^Hips/).fill("98");
    await add.getByRole("button", { name: "Save measurements" }).click();
    await expect(add.getByText(/Waist looks unusual/)).toBeVisible();
    await add.getByLabel(/^Waist/).fill("70");
    await add.getByRole("button", { name: "Save measurements" }).click();

    const everyday = page.getByRole("article", { name: "Measurements: Everyday" });
    await expect(everyday).toBeVisible();
    await expect(everyday.getByText("Default", { exact: true })).toBeVisible();
    await expect(everyday.getByText(/Taken by Self/)).toBeVisible();
    await expectNoA11yViolations(page);

    await add.getByLabel("Label").fill("Wedding");
    await add.getByLabel("Inches (in)").check();
    await add.getByLabel(/^Bust/).fill("36");
    await add.getByLabel(/^Waist/).fill("29");
    await add.getByLabel(/^Hips/).fill("40");
    await add.getByRole("button", { name: "Save measurements" }).click();
    const wedding = page.getByRole("article", { name: "Measurements: Wedding" });
    await expect(wedding).toBeVisible();
    await wedding.getByRole("button", { name: "Make default" }).click();
    await expect(wedding.getByText("Default", { exact: true })).toBeVisible();
    await expect(everyday.getByText("Default", { exact: true })).toHaveCount(0);

    await everyday.getByText("Edit (saves a new version)").click();
    await everyday.getByLabel("Label").fill("Everyday v2");
    await everyday.getByRole("button", { name: "Save new version" }).click();
    await expect(page.getByRole("article", { name: "Measurements: Everyday v2" })).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Measurements: Everyday", exact: true }),
    ).toHaveCount(0);
  });
});
