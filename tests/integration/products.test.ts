import { SHOP_PAGE_SIZE, STATUSES_FOR_FILTER } from "@/lib/shop";
import { getPublishedProductBySlug, listPublishedProducts } from "@/server/data/products";

import { createTestPrisma, uid } from "./helpers/db";

const prisma = createTestPrisma();
const prefix = uid("products");

const product = (slug: string, overrides: Record<string, unknown> = {}) => ({
  slug: `${prefix}-${slug}`,
  name: `Test ${slug}`,
  description: "Integration test product",
  priceKobo: 10_000_00,
  fabricComposition: "Cotton",
  careInstructions: "Hand wash",
  isPublished: true,
  ...overrides,
});

beforeAll(async () => {
  await prisma.product.create({
    data: {
      ...product("available", {
        quantity: 2,
        inventoryStatus: "AVAILABLE",
        bustCm: "88.5",
        waistCm: 70,
      }),
      images: {
        create: [
          { url: "https://placehold.co/2.png", alt: "second", sortOrder: 1 },
          { url: "https://placehold.co/1.png", alt: "first", sortOrder: 0 },
        ],
      },
    },
  });
  await prisma.product.create({
    data: product("sold", { quantity: 0, inventoryStatus: "SOLD_OUT" }),
  });
  await prisma.product.create({ data: product("draft", { isPublished: false }) });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

async function allSlugs(status: "all" | "available" | "sold-out") {
  const slugs: string[] = [];
  for (let page = 1; ; page++) {
    const result = await listPublishedProducts(prisma, { status, page });
    slugs.push(...result.items.map((i) => i.slug));
    if (page >= result.pageCount) return slugs;
  }
}

describe("listPublishedProducts (US-A1)", () => {
  it("never returns unpublished products (AC5)", async () => {
    expect(await allSlugs("all")).not.toContain(`${prefix}-draft`);
  });

  it.each(["all", "available", "sold-out"] as const)(
    "filter %s matches only its statuses",
    async (status) => {
      const result = await listPublishedProducts(prisma, { status, page: 1 });
      for (const item of result.items) {
        expect(STATUSES_FOR_FILTER[status]).toContain(item.inventoryStatus);
      }
      const expectedTotal = await prisma.product.count({
        where: { isPublished: true, inventoryStatus: { in: [...STATUSES_FOR_FILTER[status]] } },
      });
      expect(result.total).toBe(expectedTotal);
      expect(result.items.length).toBeLessThanOrEqual(SHOP_PAGE_SIZE);
    },
  );

  it("puts fixtures in the right filter", async () => {
    const available = await allSlugs("available");
    const soldOut = await allSlugs("sold-out");
    expect(available).toContain(`${prefix}-available`);
    expect(available).not.toContain(`${prefix}-sold`);
    expect(soldOut).toContain(`${prefix}-sold`);
  });

  it("returns the first image by sortOrder", async () => {
    const result = await listPublishedProducts(prisma, { status: "available", page: 1 });
    const card = result.items.find((i) => i.slug === `${prefix}-available`);
    expect(card?.image).toEqual({ url: "https://placehold.co/1.png", alt: "first" });
  });

  it("clamps an out-of-range page to the last page", async () => {
    const result = await listPublishedProducts(prisma, { status: "all", page: 10_000 });
    expect(result.page).toBe(result.pageCount);
    expect(result.items.length).toBeGreaterThan(0);
  });
});

describe("getPublishedProductBySlug (US-A2)", () => {
  it("returns detail with numeric measurements and ordered images", async () => {
    const p = await getPublishedProductBySlug(prisma, `${prefix}-available`);
    expect(p).toMatchObject({
      name: "Test available",
      inventoryStatus: "AVAILABLE",
      measurements: { bust: 88.5, waist: 70, hips: null, length: null },
      images: [
        { url: "https://placehold.co/1.png", alt: "first" },
        { url: "https://placehold.co/2.png", alt: "second" },
      ],
    });
  });

  it("returns null for unpublished or missing slugs (AC4)", async () => {
    expect(await getPublishedProductBySlug(prisma, `${prefix}-draft`)).toBeNull();
    expect(await getPublishedProductBySlug(prisma, `${prefix}-nope`)).toBeNull();
  });
});
