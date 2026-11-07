import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { deriveInventoryStatus } from "@/lib/inventory";

/**
 * Demo content (Admin → Settings): sample products, swatches, portfolio pieces, delivery
 * zones and booking hours, so a fresh site can be shown and tested before the real
 * catalogue is ready. Everything is recognisable and removable: products have `demo-`
 * slugs, swatches and portfolio pieces use the bundled /demo/ images, and zone names
 * start with "DEMO". Loading twice changes nothing.
 */

type Db = Pick<
  PrismaClient,
  | "product"
  | "productImage"
  | "fabricSwatch"
  | "portfolioItem"
  | "deliveryZone"
  | "availabilityRule"
  | "$transaction"
>;

export const DEMO_SLUG_PREFIX = "demo-";
export const DEMO_IMAGE_PREFIX = "/demo/";
export const DEMO_ZONE_PREFIX = "DEMO";

const DEMO_NOTE =
  "Demo piece for testing the site; it is removed with the rest of the demo content.";

const SWATCHES = [
  {
    key: "emerald",
    name: "Emerald Lace",
    colorHex: "#0F4D3A",
    imageUrl: "/demo/swatch-emerald-lace.jpg",
    composition: "Corded lace, 100% polyester with gold thread",
  },
  {
    key: "indigo",
    name: "Indigo Adire",
    colorHex: "#1D2A6B",
    imageUrl: "/demo/swatch-indigo-adire.jpg",
    composition: "Hand-dyed adire, 100% cotton",
  },
  {
    key: "wine",
    name: "Wine Aso Oke",
    colorHex: "#4A1830",
    imageUrl: "/demo/swatch-wine-aso-oke.jpg",
    composition: "Hand-woven aso oke, cotton and lurex",
  },
  {
    key: "sunset",
    name: "Sunset Ankara",
    colorHex: "#B5471C",
    imageUrl: "/demo/swatch-sunset-ankara.jpg",
    composition: "Wax print ankara, 100% cotton",
  },
] as const;

type SwatchKey = (typeof SWATCHES)[number]["key"];

const PRODUCTS: {
  slug: string;
  name: string;
  description: string;
  priceKobo: number;
  quantity: number;
  sizeLabel: string;
  bustCm: number;
  waistCm: number;
  hipsCm: number;
  lengthCm: number;
  fabricComposition: string;
  careInstructions: string;
  swatch: SwatchKey | null;
  image: string;
  alt: string;
}[] = [
  {
    slug: "demo-emerald-lace-gown",
    name: "Emerald Lace Gown",
    description: "A floor-length gown in corded emerald lace with a sweeping A-line skirt.",
    priceKobo: 18_500_000,
    quantity: 2,
    sizeLabel: "UK 12",
    bustCm: 96,
    waistCm: 78,
    hipsCm: 104,
    lengthCm: 150,
    fabricComposition: "Corded lace, 100% polyester; satin lining",
    careInstructions: "Dry clean only. Store on a padded hanger.",
    swatch: "emerald",
    image: "/demo/product-emerald-gown.jpg",
    alt: "Emerald lace gown on a gold hanger",
  },
  {
    slug: "demo-indigo-adire-kaftan",
    name: "Indigo Adire Kaftan",
    description: "A relaxed kaftan in hand-dyed indigo adire, cut for easy movement.",
    priceKobo: 6_500_000,
    quantity: 1,
    sizeLabel: "One size",
    bustCm: 120,
    waistCm: 120,
    hipsCm: 124,
    lengthCm: 140,
    fabricComposition: "Hand-dyed adire, 100% cotton",
    careInstructions: "Hand wash cold, separately. Dry in the shade.",
    swatch: "indigo",
    image: "/demo/product-indigo-kaftan.jpg",
    alt: "Indigo adire kaftan on a gold hanger",
  },
  {
    slug: "demo-royal-aso-oke-agbada",
    name: "Royal Aso Oke Agbada",
    description: "A three-piece agbada in hand-woven wine aso oke with gold embroidery.",
    priceKobo: 32_000_000,
    quantity: 0,
    sizeLabel: "L",
    bustCm: 116,
    waistCm: 100,
    hipsCm: 112,
    lengthCm: 145,
    fabricComposition: "Hand-woven aso oke, cotton and lurex",
    careInstructions: "Dry clean only.",
    swatch: "wine",
    image: "/demo/product-royal-agbada.jpg",
    alt: "Wine aso oke agbada on a gold hanger",
  },
  {
    slug: "demo-ankara-two-piece",
    name: "Sunset Ankara Two-Piece",
    description: "A fitted crop top and flared midi skirt in bold sunset ankara.",
    priceKobo: 4_800_000,
    quantity: 3,
    sizeLabel: "UK 10",
    bustCm: 88,
    waistCm: 70,
    hipsCm: 98,
    lengthCm: 110,
    fabricComposition: "Wax print ankara, 100% cotton",
    careInstructions: "Machine wash cold, inside out. Iron on the reverse.",
    swatch: "sunset",
    image: "/demo/product-ankara-two-piece.jpg",
    alt: "Ankara crop top and skirt on a gold hanger",
  },
  {
    slug: "demo-ivory-silk-wrap",
    name: "Ivory Silk Wrap Dress",
    description: "A soft ivory wrap dress with a deep V neckline and flutter sleeves.",
    priceKobo: 9_500_000,
    quantity: 1,
    sizeLabel: "UK 14",
    bustCm: 100,
    waistCm: 84,
    hipsCm: 108,
    lengthCm: 135,
    fabricComposition: "Silk crepe de chine, 100% silk",
    careInstructions: "Dry clean recommended. Cool iron.",
    swatch: null,
    image: "/demo/product-ivory-wrap.jpg",
    alt: "Ivory silk wrap dress on a gold hanger",
  },
  {
    slug: "demo-onyx-jumpsuit",
    name: "Onyx Evening Jumpsuit",
    description: "A sleek black jumpsuit with wide legs and a gold-trimmed neckline.",
    priceKobo: 7_200_000,
    quantity: 0,
    sizeLabel: "UK 8",
    bustCm: 84,
    waistCm: 66,
    hipsCm: 92,
    lengthCm: 155,
    fabricComposition: "Stretch crepe, 95% polyester, 5% elastane",
    careInstructions: "Hand wash cold. Do not tumble dry.",
    swatch: null,
    image: "/demo/product-onyx-jumpsuit.jpg",
    alt: "Black jumpsuit on a gold hanger",
  },
];

const PORTFOLIO: {
  title: string;
  description: string;
  imageUrl: string;
  tags: string[];
  sourceSlug: string | null;
}[] = [
  {
    title: "Gold Bridal Gown",
    description: "A bespoke bridal gown in gold-threaded lace, made over three fittings.",
    imageUrl: "/demo/portfolio-gold-bridal.jpg",
    tags: ["hero", "bridal", "lace"],
    sourceSlug: null,
  },
  {
    title: "Adire Statement Kaftan",
    description: "A made-to-measure kaftan in hand-dyed adire for a naming ceremony.",
    imageUrl: "/demo/portfolio-adire-kaftan.jpg",
    tags: ["kaftan", "adire"],
    sourceSlug: "demo-indigo-adire-kaftan",
  },
  {
    title: "Aso Oke Wedding Agbada",
    description: "A groom's agbada in olive aso oke with hand-finished embroidery.",
    imageUrl: "/demo/portfolio-aso-oke-agbada.jpg",
    tags: ["menswear", "wedding", "aso-oke"],
    sourceSlug: null,
  },
  {
    title: "Ankara Wrap Dress",
    description: "A wrap dress in red and gold ankara, cut to the client's measurements.",
    imageUrl: "/demo/portfolio-ankara-wrap.jpg",
    tags: ["ankara", "dress"],
    sourceSlug: null,
  },
];

const ZONES = [
  { name: "DEMO — Lagos", states: ["Lagos"], feeKobo: 350_000, etaDays: 2 },
  { name: "DEMO — South-South", states: ["Edo", "Delta", "Rivers"], feeKobo: 700_000, etaDays: 4 },
  { name: "DEMO — North", states: ["FCT", "Kaduna", "Kano"], feeKobo: 850_000, etaDays: 5 },
];

/** Mon–Fri 10:00–17:00 and Sat 10:00–14:00 (studio time). */
const HOURS = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 600, endMinute: 1020 })),
  { weekday: 6, startMinute: 600, endMinute: 840 },
];

export interface DemoSummary {
  products: number;
  swatches: number;
  portfolio: number;
  zones: number;
}

/** How much demo content is on the site now. */
export async function demoContentSummary(db: Db): Promise<DemoSummary> {
  const [products, swatches, portfolio, zones] = await Promise.all([
    db.product.count({ where: { slug: { startsWith: DEMO_SLUG_PREFIX } } }),
    db.fabricSwatch.count({ where: { imageUrl: { startsWith: DEMO_IMAGE_PREFIX } } }),
    db.portfolioItem.count({ where: { imageUrl: { startsWith: DEMO_IMAGE_PREFIX } } }),
    db.deliveryZone.count({ where: { name: { startsWith: DEMO_ZONE_PREFIX } } }),
  ]);
  return { products, swatches, portfolio, zones };
}

/**
 * Adds the demo content, skipping anything already there. Booking hours are added only
 * when the studio has none, so real hours are never changed.
 */
export async function loadDemoContent(db: Db): Promise<{ addedHours: boolean }> {
  const swatchIds = new Map<SwatchKey, string>();
  for (const [i, s] of SWATCHES.entries()) {
    const existing = await db.fabricSwatch.findFirst({
      where: { imageUrl: s.imageUrl },
      select: { id: true },
    });
    const row =
      existing ??
      (await db.fabricSwatch.create({
        data: {
          name: s.name,
          colorHex: s.colorHex,
          imageUrl: s.imageUrl,
          composition: s.composition,
          isAvailable: true,
          sortOrder: 900 + i,
        },
        select: { id: true },
      }));
    swatchIds.set(s.key, row.id);
  }

  const productIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const existing = await db.product.findUnique({ where: { slug: p.slug }, select: { id: true } });
    if (existing) {
      productIds.set(p.slug, existing.id);
      continue;
    }
    const row = await db.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        description: `${p.description}\n\n${DEMO_NOTE}`,
        priceKobo: p.priceKobo,
        quantity: p.quantity,
        inventoryStatus: deriveInventoryStatus(p.quantity),
        sizeLabel: p.sizeLabel,
        bustCm: p.bustCm,
        waistCm: p.waistCm,
        hipsCm: p.hipsCm,
        lengthCm: p.lengthCm,
        fabricComposition: p.fabricComposition,
        careInstructions: p.careInstructions,
        isPublished: true,
        fabricSwatchId: p.swatch ? (swatchIds.get(p.swatch) ?? null) : null,
        images: { create: [{ url: p.image, alt: p.alt, sortOrder: 0 }] },
      },
      select: { id: true },
    });
    productIds.set(p.slug, row.id);
  }

  for (const item of PORTFOLIO) {
    const existing = await db.portfolioItem.findFirst({
      where: { imageUrl: item.imageUrl },
      select: { id: true },
    });
    if (existing) continue;
    await db.portfolioItem.create({
      data: {
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        tags: item.tags,
        isPublished: true,
        sourceProductId: item.sourceSlug ? (productIds.get(item.sourceSlug) ?? null) : null,
      },
    });
  }

  for (const z of ZONES) {
    const existing = await db.deliveryZone.findFirst({
      where: { name: z.name },
      select: { id: true },
    });
    if (!existing) await db.deliveryZone.create({ data: { ...z, isActive: true } });
  }

  const hasHours = (await db.availabilityRule.count()) > 0;
  if (!hasHours) await db.availabilityRule.createMany({ data: HOURS });
  return { addedHours: !hasHours };
}

/**
 * Removes the demo content. A demo product that has orders can't be deleted (orders keep
 * their product), so it is unpublished and marked sold out instead. Booking hours are
 * left alone: they may have been edited since.
 */
export async function removeDemoContent(db: Db): Promise<{ kept: number }> {
  const demoProduct = { slug: { startsWith: DEMO_SLUG_PREFIX } };
  return db.$transaction(async (tx) => {
    const withOrders = { ...demoProduct, orders: { some: {} } };
    const kept = await tx.product.updateMany({
      where: withOrders,
      data: { isPublished: false, quantity: 0, inventoryStatus: deriveInventoryStatus(0) },
    });
    await tx.product.deleteMany({ where: { ...demoProduct, orders: { none: {} } } });
    await tx.portfolioItem.deleteMany({ where: { imageUrl: { startsWith: DEMO_IMAGE_PREFIX } } });
    await tx.fabricSwatch.deleteMany({ where: { imageUrl: { startsWith: DEMO_IMAGE_PREFIX } } });
    await tx.deliveryZone.deleteMany({ where: { name: { startsWith: DEMO_ZONE_PREFIX } } });
    return { kept: kept.count };
  });
}
