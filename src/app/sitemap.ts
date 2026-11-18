import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { PRODUCTS_TAG } from "@/server/loaders/products";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Public pages only; account, checkout and admin pages are private (see robots.ts). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/custom`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/custom/gallery`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/policies/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
  const products = (await publishedProductSlugs()).map((p) => ({
    url: `${SITE}/shop/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
  return [...pages, ...products];
}

async function publishedProductSlugs() {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  cacheLife("hours");
  return prisma.product.findMany({
    where: { isPublished: true },
    select: { slug: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });
}
