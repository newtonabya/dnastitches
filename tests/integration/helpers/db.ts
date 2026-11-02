import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/** A dedicated client for integration tests (the app singleton validates the full env). */
export function createTestPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
}

/** Unique prefix so parallel/local runs never collide with seed or other test data. */
export const uid = (label: string) =>
  `it-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
