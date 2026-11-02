import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { MAGIC_LINK_FILE } from "../../playwright.config";

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
