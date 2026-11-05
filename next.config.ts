import type { NextConfig } from "next";

import { parseEnv } from "./src/lib/env.schema";

// Validate environment variables at boot: a missing or malformed var fails
// `next dev` / `next build` (PRD §9 rule 5). Skipped for `next typegen`, which
// only generates route types and needs no runtime configuration.
if (!process.argv.includes("typegen")) {
  parseEnv(process.env);
}

/**
 * Security headers for every response. A full Content-Security-Policy would need
 * per-request nonces for Next's inline scripts; `frame-ancestors` (clickjacking) is the
 * part that matters most here and needs none.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The E2E dev server hides the floating dev-tools button: on small screens it covers
  // buttons near the bottom-left and takes their clicks. Production never shows it.
  devIndicators: process.env.DISABLE_DEV_INDICATORS === "1" ? false : undefined,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
