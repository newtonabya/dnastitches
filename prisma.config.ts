import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads the datasource URL from schema.prisma.
// `process.env` is used (instead of Prisma's `env()` helper, which throws when
// unset) so that `prisma generate` / `prisma validate` work without a database,
// e.g. during `pnpm install` and in CI.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
