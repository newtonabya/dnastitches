import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/tests/unit/**/*.test.{ts,tsx}"],
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

export default createJestConfig(config);
