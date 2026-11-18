import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or transactional pages: nothing for search engines there.
      disallow: ["/admin", "/account", "/checkout", "/sign-in", "/api", "/dev"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
