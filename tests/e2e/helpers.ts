import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { MAGIC_LINK_FILE, e2eAdminEmail } from "../../playwright.config";

/** Seeded fixtures (prisma/seed.ts). */
export const SEED = {
  available: { slug: "adire-wrap-dress", name: "Adire Wrap Dress" },
  lowStock: { slug: "aso-oke-corset", name: "Gold Aso-Oke Corset" },
  soldOut: { slug: "adire-maxi-skirt", name: "Adire Maxi Skirt" },
  draft: { slug: "draft-silk-blazer", name: "Silk Blazer (draft)" },
  portfolio: { id: "seed-portfolio-bridal-aso-oke", title: "Bridal Aso-Oke Ensemble" },
  soldOutSwatch: "Indigo Adire",
} as const;

/** Give each test its own client IP so per-IP rate limits never collide across tests. */
export async function useUniqueIp(page: Page) {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${octet()}.${octet()}` });
}

/** WCAG 2.2 AA automated checks (NFR-2). */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

/** Wait for the dev server to log a magic link for `email` and return it. */
export async function magicLinkFor(email: string): Promise<string> {
  let url: string | undefined;
  await expect
    .poll(
      async () => {
        const text = await readFile(MAGIC_LINK_FILE, "utf8").catch(() => "");
        url = text
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { identifier: string; url: string })
          .reverse()
          .find((entry) => entry.identifier === email)?.url;
        return url;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return url!;
}

/** Sign in through the real magic-link flow, starting from wherever the page is now. */
export async function signInWithMagicLink(page: Page, email: string) {
  // Scope to the sign-in form: Next keeps the previous page mounted (hidden) after a
  // client-side navigation, so other "Email" fields may still be in the DOM.
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Email me a sign-in link" }) });
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Email me a sign-in link" }).click();
  // Generous timeout: the dev server may compile the auth routes on first use.
  await expect(page.getByText(/Check your email for a sign-in link/)).toBeVisible({
    timeout: 20_000,
  });
  await page.goto(await magicLinkFor(email));
}

/** Sign in as this test's admin account (slots are unique per spec file), landing on `to`. */
export async function signInAsAdminSlot(page: Page, slot: number, to: string) {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(to)}`);
  await signInWithMagicLink(page, e2eAdminEmail(test.info().project.name, slot));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
}

/** As an admin: create a fresh published 1-of-1 piece (so tests never sell out seed products). */
export async function createPiece(page: Page, name: string): Promise<string> {
  await page.goto("/admin/products/new");
  const form = page.getByRole("form", { name: "New product" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (₦)").fill("120,000");
  await form.getByLabel("Quantity in stock").fill("1");
  await form.getByLabel("Description").fill("A piece created by an E2E test.");
  await form.getByLabel("Fabric composition").fill("100% cotton");
  await form.getByLabel("Care instructions").fill("Dry clean only.");
  await form.getByLabel("Bust").fill("90");
  await form.getByLabel("Published (visible in the shop)").check();
  await form.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Product created and published.")).toBeVisible();
  return (await page.getByText(/^\/shop\//).textContent())!.replace("/shop/", "").trim();
}

/** On the dev payment gateway (/dev/paystack): approve the payment. */
export async function payOnDevGateway(page: Page) {
  await expect(page).toHaveURL(/\/dev\/paystack\?reference=dna-/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dev payment gateway" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
}

/** As a signed-in customer on a product page: buy it with pickup through the dev gateway. */
export async function buyWithPickup(page: Page) {
  const checkout = page.getByRole("form", { name: "Checkout" });
  await expect(checkout).toBeVisible({ timeout: 20_000 });
  await checkout.getByRole("checkbox").check();
  await checkout.getByRole("button", { name: /^Pay / }).click();
  await payOnDevGateway(page);
  await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 20_000 });
}
