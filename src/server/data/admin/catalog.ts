import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { deriveInventoryStatus } from "@/lib/inventory";
import { slugify, uniqueSlug } from "@/lib/slug";
import { isBlobUrl } from "@/lib/uploads";
import type { PortfolioInput, ProductInput, SwatchInput } from "@/lib/validators/catalog";

/**
 * Admin catalog writes (US-C3). Products are never hard-deleted (unpublish instead,
 * PRD §5.3). `inventoryStatus` is always derived from `quantity` (US-A1 DoD). Image
 * URLs must be our own Blob uploads, or URLs the item already had (e.g. seed images).
 */

type Db = PrismaClient;

export type CatalogResult<T = object> =
  ({ ok: true } & T) | { ok: false; fieldErrors: Record<string, string> };

const MAX_SLUG_ATTEMPTS = 5;

function isUniqueViolation(error: unknown, field: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes(field)
  );
}

function badImage(
  urls: readonly string[],
  allowed: ReadonlySet<string>,
  key: (i: number) => string,
) {
  const index = urls.findIndex((url) => !isBlobUrl(url) && !allowed.has(url));
  return index === -1
    ? null
    : { [key(index)]: "Upload this image again (only uploaded images can be used)." };
}

async function freeSlug(db: Pick<Db, "product">, name: string, excludeId?: string) {
  const base = slugify(name);
  const taken = await db.product.findMany({
    where: { slug: { startsWith: base }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { slug: true },
  });
  return uniqueSlug(
    base,
    taken.map((t) => t.slug),
  );
}

function productData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description,
    priceKobo: input.priceNaira,
    quantity: input.quantity,
    inventoryStatus: deriveInventoryStatus(input.quantity),
    sizeLabel: input.sizeLabel ?? null,
    bustCm: input.bustCm ?? null,
    waistCm: input.waistCm ?? null,
    hipsCm: input.hipsCm ?? null,
    lengthCm: input.lengthCm ?? null,
    fabricComposition: input.fabricComposition,
    careInstructions: input.careInstructions,
    fabricSwatchId: input.fabricSwatchId ?? null,
    isPublished: input.isPublished,
  };
}

async function checkSwatch(db: Pick<Db, "fabricSwatch">, id: string | undefined) {
  if (!id) return null;
  const found = await db.fabricSwatch.findUnique({ where: { id }, select: { id: true } });
  return found ? null : { fabricSwatchId: "Choose a swatch from the list." };
}

// ── Products ────────────────────────────────────────────────────────────────

export async function listAdminProducts(db: Pick<Db, "product">) {
  const rows = await db.product.findMany({
    orderBy: [{ isPublished: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      priceKobo: true,
      quantity: true,
      inventoryStatus: true,
      isPublished: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
      _count: { select: { notificationRequests: true } },
    },
  });
  return rows.map(({ images, _count, ...p }) => ({
    ...p,
    image: images[0] ?? null,
    notifyCount: _count.notificationRequests,
  }));
}

export async function getAdminProduct(db: Pick<Db, "product">, id: string) {
  const p = await db.product.findUnique({
    where: { id },
    include: { images: { orderBy: { sortOrder: "asc" }, select: { url: true, alt: true } } },
  });
  if (!p) return null;
  const num = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());
  return {
    ...p,
    bustCm: num(p.bustCm),
    waistCm: num(p.waistCm),
    hipsCm: num(p.hipsCm),
    lengthCm: num(p.lengthCm),
  };
}

export type AdminProduct = NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>;

export async function createProduct(
  db: Db,
  input: ProductInput,
): Promise<CatalogResult<{ id: string; slug: string }>> {
  const imageError = badImage(
    input.images.map((i) => i.url),
    new Set(),
    (i) => `images.${i}.url`,
  );
  if (imageError) return { ok: false, fieldErrors: imageError };
  const swatchError = await checkSwatch(db, input.fabricSwatchId);
  if (swatchError) return { ok: false, fieldErrors: swatchError };

  for (let attempt = 1; ; attempt++) {
    try {
      const slug = await freeSlug(db, input.name);
      const product = await db.product.create({
        data: {
          ...productData(input),
          slug,
          images: { create: input.images.map((img, sortOrder) => ({ ...img, sortOrder })) },
        },
        select: { id: true, slug: true },
      });
      return { ok: true, ...product };
    } catch (error) {
      if (isUniqueViolation(error, "slug") && attempt < MAX_SLUG_ATTEMPTS) continue;
      throw error;
    }
  }
}

/** Update a product. The slug stays the same unless `regenerateSlug` is set (US-C3 AC3). */
export async function updateProduct(
  db: Db,
  id: string,
  input: ProductInput,
): Promise<CatalogResult<{ oldSlug: string; slug: string }> | { ok: false; notFound: true }> {
  const existing = await db.product.findUnique({
    where: { id },
    select: { slug: true, images: { select: { url: true } } },
  });
  if (!existing) return { ok: false, notFound: true };

  const imageError = badImage(
    input.images.map((i) => i.url),
    new Set(existing.images.map((i) => i.url)),
    (i) => `images.${i}.url`,
  );
  if (imageError) return { ok: false, fieldErrors: imageError };
  const swatchError = await checkSwatch(db, input.fabricSwatchId);
  if (swatchError) return { ok: false, fieldErrors: swatchError };

  for (let attempt = 1; ; attempt++) {
    try {
      const slug = input.regenerateSlug ? await freeSlug(db, input.name, id) : existing.slug;
      await db.$transaction([
        db.product.update({ where: { id }, data: { ...productData(input), slug } }),
        db.productImage.deleteMany({ where: { productId: id } }),
        db.productImage.createMany({
          data: input.images.map((img, sortOrder) => ({
            productId: id,
            url: img.url,
            alt: img.alt,
            sortOrder,
          })),
        }),
      ]);
      return { ok: true, oldSlug: existing.slug, slug };
    } catch (error) {
      if (isUniqueViolation(error, "slug") && attempt < MAX_SLUG_ATTEMPTS) continue;
      throw error;
    }
  }
}

/** US-C3 AC2: mark a piece sold (e.g. sold in person): quantity 0 → SOLD_OUT. */
export async function markProductSoldOut(
  db: Pick<Db, "product">,
  id: string,
): Promise<{ slug: string } | null> {
  const updated = await db.product.updateMany({
    where: { id },
    data: { quantity: 0, inventoryStatus: deriveInventoryStatus(0) },
  });
  if (updated.count !== 1) return null;
  return db.product.findUniqueOrThrow({ where: { id }, select: { slug: true } });
}

/** US-D2 AC4: notify-me requests for one product. */
export async function listProductNotificationRequests(
  db: Pick<Db, "notificationRequest">,
  productId: string,
) {
  return db.notificationRequest.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
    select: {
      email: true,
      type: true,
      createdAt: true,
      notifiedAt: true,
      user: { select: { name: true } },
    },
  });
}

// ── Swatches ────────────────────────────────────────────────────────────────

export async function listAdminSwatches(db: Pick<Db, "fabricSwatch">) {
  return db.fabricSwatch.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, customOrders: true } } },
  });
}

export async function createSwatch(
  db: Pick<Db, "fabricSwatch">,
  input: SwatchInput,
): Promise<CatalogResult<{ id: string }>> {
  const imageError = badImage([input.imageUrl], new Set(), () => "imageUrl");
  if (imageError) return { ok: false, fieldErrors: imageError };
  const swatch = await db.fabricSwatch.create({ data: input, select: { id: true } });
  return { ok: true, id: swatch.id };
}

export async function updateSwatch(
  db: Pick<Db, "fabricSwatch">,
  id: string,
  input: SwatchInput,
): Promise<CatalogResult | { ok: false; notFound: true }> {
  const existing = await db.fabricSwatch.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!existing) return { ok: false, notFound: true };
  const imageError = badImage([input.imageUrl], new Set([existing.imageUrl]), () => "imageUrl");
  if (imageError) return { ok: false, fieldErrors: imageError };
  await db.fabricSwatch.update({ where: { id }, data: input });
  return { ok: true };
}

// ── Portfolio ───────────────────────────────────────────────────────────────

export async function listAdminPortfolio(db: Pick<Db, "portfolioItem">) {
  return db.portfolioItem.findMany({
    orderBy: [{ isPublished: "desc" }, { createdAt: "desc" }],
    include: {
      sourceProduct: { select: { name: true } },
      _count: { select: { customOrders: true } },
    },
  });
}

async function checkSourceProduct(db: Pick<Db, "product">, id: string | undefined) {
  if (!id) return null;
  const found = await db.product.findUnique({ where: { id }, select: { id: true } });
  return found ? null : { sourceProductId: "Choose a product from the list." };
}

export async function createPortfolioItem(
  db: Db,
  input: PortfolioInput,
): Promise<CatalogResult<{ id: string }>> {
  const errors =
    badImage([input.imageUrl], new Set(), () => "imageUrl") ??
    (await checkSourceProduct(db, input.sourceProductId));
  if (errors) return { ok: false, fieldErrors: errors };
  const item = await db.portfolioItem.create({
    data: { ...input, sourceProductId: input.sourceProductId ?? null },
    select: { id: true },
  });
  return { ok: true, id: item.id };
}

export async function updatePortfolioItem(
  db: Db,
  id: string,
  input: PortfolioInput,
): Promise<CatalogResult | { ok: false; notFound: true }> {
  const existing = await db.portfolioItem.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!existing) return { ok: false, notFound: true };
  const errors =
    badImage([input.imageUrl], new Set([existing.imageUrl]), () => "imageUrl") ??
    (await checkSourceProduct(db, input.sourceProductId));
  if (errors) return { ok: false, fieldErrors: errors };
  await db.portfolioItem.update({
    where: { id },
    data: { ...input, sourceProductId: input.sourceProductId ?? null },
  });
  return { ok: true };
}
