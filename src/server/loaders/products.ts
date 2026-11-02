import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import type { ShopFilters } from "@/lib/shop";
import {
  getPublishedProductBySlug,
  listPublishedProducts,
  type ProductDetailData,
  type ProductListPage,
} from "@/server/data/products";

/** Cache tag for every public product read. Admin product mutations (US-C3) must `updateTag` it. */
export const PRODUCTS_TAG = "products";
export const productTag = (slug: string) => `product:${slug}`;

export async function getShopProducts(filters: ShopFilters): Promise<ProductListPage> {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  cacheLife("minutes");
  return listPublishedProducts(prisma, filters);
}

export async function getProductBySlug(slug: string): Promise<ProductDetailData | null> {
  "use cache";
  cacheTag(PRODUCTS_TAG, productTag(slug));
  cacheLife("minutes");
  return getPublishedProductBySlug(prisma, slug);
}
