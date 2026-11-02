import type { NextConfig } from "next";

import { parseEnv } from "./src/lib/env.schema";

// Validate environment variables at boot: a missing or malformed var fails
// `next dev` / `next build` (PRD §9 rule 5). Skipped for `next typegen`, which
// only generates route types and needs no runtime configuration.
if (!process.argv.includes("typegen")) {
  parseEnv(process.env);
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      // Vercel Blob uploads (product, swatch and portfolio images).
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Seed placeholder images (prisma/seed.ts).
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
