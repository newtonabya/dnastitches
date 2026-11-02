import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

type Db = Pick<PrismaClient, "product" | "portfolioItem">;

export interface CustomRequestPrefill {
  title?: string;
  referenceImageUrls: string[];
  fabricSwatchId?: string;
  fromProductId?: string;
  fromPortfolioId?: string;
  /** Shown as a dismissible notice when a source ID couldn't be used (US-B2 AC5). */
  notice?: string;
}

export const PREFILL_NOT_FOUND_NOTICE =
  "We couldn't find the piece you came from, so we've started a blank request.";

const EMPTY: CustomRequestPrefill = { referenceImageUrls: [] };

/**
 * Shared pre-fill for /custom/request (US-A3, US-B2). Invalid, unpublished or unknown
 * IDs fall back to an empty form with a notice; this never throws for bad input.
 * If both sources are given, the product wins.
 */
export async function resolveCustomRequestPrefill(
  db: Db,
  { fromProduct, fromPortfolio }: { fromProduct?: string | null; fromPortfolio?: string | null },
): Promise<CustomRequestPrefill> {
  const productId = fromProduct?.trim();
  const portfolioId = fromPortfolio?.trim();

  if (productId) {
    const product = await db.product
      .findFirst({
        where: { id: productId, isPublished: true },
        select: {
          id: true,
          name: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          fabricSwatch: { select: { id: true, isAvailable: true } },
        },
      })
      .catch(() => null);
    if (!product) return { ...EMPTY, notice: PREFILL_NOT_FOUND_NOTICE };
    return {
      title: `Custom version of ${product.name}`,
      referenceImageUrls: product.images.map((i) => i.url),
      fabricSwatchId: product.fabricSwatch?.isAvailable ? product.fabricSwatch.id : undefined,
      fromProductId: product.id,
    };
  }

  if (portfolioId) {
    const item = await db.portfolioItem
      .findFirst({
        where: { id: portfolioId, isPublished: true },
        select: { id: true, title: true, imageUrl: true },
      })
      .catch(() => null);
    if (!item) return { ...EMPTY, notice: PREFILL_NOT_FOUND_NOTICE };
    return {
      title: `Inspired by ${item.title}`,
      referenceImageUrls: [item.imageUrl],
      fromPortfolioId: item.id,
    };
  }

  return EMPTY;
}
