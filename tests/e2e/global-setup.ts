import "dotenv/config";

import { Client } from "pg";

/**
 * Before a local E2E run, unpublish products earlier runs created (their slugs start
 * with "e2e-"), so they never push the seeded pieces off the shop's first page.
 * Skipped against a deployed preview (PLAYWRIGHT_BASE_URL), whose data we don't own.
 */
export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_BASE_URL || !process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "Product" SET "isPublished" = false WHERE slug LIKE 'e2e-%' AND "isPublished"`,
    );
  } finally {
    await client.end();
  }
}
