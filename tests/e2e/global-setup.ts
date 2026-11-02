import "dotenv/config";

import { Client } from "pg";

/**
 * Before a local E2E run, tidy what earlier runs left behind: unpublish their products
 * (slugs start with "e2e-") so they never push the seeded pieces off the shop's first
 * page, and remove E2E users' appointments and blocked dates so booking slots stay free.
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
    await client.query(
      `DELETE FROM "Appointment" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'e2e-%')`,
    );
    await client.query(`DELETE FROM "BlackoutDate" WHERE reason LIKE 'E2E%'`);
  } finally {
    await client.end();
  }
}
