import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const shared = {
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // `server-only` throws outside a React Server environment; it is a no-op in tests.
    "^server-only$": "<rootDir>/tests/helpers/empty-module.ts",
  },
};

/** Unit + component tests: pure functions and React components (jsdom). */
const unit = createJestConfig({
  ...shared,
  displayName: "unit",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/tests/unit/**/*.test.{ts,tsx}"],
});

/** Integration tests: Server Actions and loaders against a real Postgres (DATABASE_URL). */
const integration = createJestConfig({
  ...shared,
  displayName: "integration",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/integration/setup-env.ts"],
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
});

/** @returns {Promise<import('jest').Config>} */
export default async function config() {
  const integrationConfig = await integration();
  return {
    projects: [
      await unit(),
      {
        ...integrationConfig,
        // Prisma 7's runtime loads ESM-only query-compiler modules from node_modules.
        transformIgnorePatterns: ["/node_modules/(?!(\\.pnpm/@prisma\\+|@prisma/))"],
      },
    ],
    collectCoverageFrom: [
      "src/lib/**/*.{ts,tsx}",
      "!src/lib/prisma.ts",
      "!src/lib/auth.ts",
      "!src/lib/auth.config.ts",
      "!src/lib/env.ts",
      "!src/lib/utils.ts",
    ],
    coverageThreshold: {
      "./src/lib/": { lines: 90 },
    },
  };
}
