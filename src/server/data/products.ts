import "server-only";

import type { InventoryStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { SHOP_PAGE_SIZE, STATUSES_FOR_FILTER, type ShopFilters, pageCount } from "@/lib/shop";

/**
 * Product reads (US-A1, US-A2). Plain functions taking a Prisma client so they can be
 * integration-tested; pages use the cached wrappers in `src/server/loaders/products.ts`.
 * Only published products are ever returned (US-A1 AC5, US-A2 AC4).
 */

type Db = Pick<PrismaClient, "product">;

export interface ProductImageData {
  url: string;
  alt: string;
}

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  priceKobo: number;
  inventoryStatus: InventoryStatus;
  image: ProductImageData | null;
}

export interface ProductListPage {
  items: ProductCardData[];
  total: number;
  page: number;
  pageCount: number;
}

export interface ProductDetailData extends ProductCardData {
  description: string;
  currency: string;
  images: ProductImageData[];
  sizeLabel: string | null;
  /** Garment measurements in cm (null when not recorded). */
  measurements: {
    bust: number | null;
    waist: number | null;
    hips: number | null;
    length: number | null;
  };
  fabricComposition: string;
  careInstructions: string;
  fabricSwatch: { id: string; name: string; colorHex: string } | null;
}

const toNumber = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

export async function listPublishedProducts(
  db: Db,
  filters: ShopFilters,
): Promise<ProductListPage> {
  const where = {
    isPublished: true,
    inventoryStatus: { in: [...STATUSES_FOR_FILTER[filters.status]] },
  };
  const total = await db.product.count({ where });
  const pages = pageCount(total);
  // Out-of-range pages clamp to the last page rather than showing an empty grid.
  const page = Math.min(filters.page, pages);
  const rows = await db.product.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * SHOP_PAGE_SIZE,
    take: SHOP_PAGE_SIZE,
    select: {
      id: true,
      slug: true,
      name: true,
      priceKobo: true,
      inventoryStatus: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
    },
  });
  return {
    items: rows.map(({ images, ...p }) => ({ ...p, image: images[0] ?? null })),
    total,
    page,
    pageCount: pages,
  };
}

export async function getPublishedProductBySlug(
  db: Db,
  slug: string,
): Promise<ProductDetailData | null> {
  const p = await db.product.findFirst({
    where: { slug, isPublished: true },
    include: {
      images: { orderBy: { sortOrder: "asc" }, select: { url: true, alt: true } },
      fabricSwatch: { select: { id: true, name: true, colorHex: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceKobo: p.priceKobo,
    currency: p.currency,
    inventoryStatus: p.inventoryStatus,
    image: p.images[0] ?? null,
    images: p.images,
    sizeLabel: p.sizeLabel,
    measurements: {
      bust: toNumber(p.bustCm),
      waist: toNumber(p.waistCm),
      hips: toNumber(p.hipsCm),
      length: toNumber(p.lengthCm),
    },
    fabricComposition: p.fabricComposition,
    careInstructions: p.careInstructions,
    fabricSwatch: p.fabricSwatch,
  };
}
