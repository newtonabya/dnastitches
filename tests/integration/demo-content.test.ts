import { demoContentSummary, loadDemoContent, removeDemoContent } from "@/server/data/admin/demo";

import { createTestPrisma, uid } from "./helpers/db";

const prisma = createTestPrisma();
const prefix = uid("demo");
let userId = "";
let realSwatchId = "";
let hadHours = false;

beforeAll(async () => {
  // Start clean, in case an earlier run stopped half way.
  await removeDemoContent(prisma);
  await prisma.order.deleteMany({ where: { product: { slug: { startsWith: "demo-" } } } });
  await removeDemoContent(prisma);
  hadHours = (await prisma.availabilityRule.count()) > 0;
  userId = (await prisma.user.create({ data: { email: `${prefix}@example.com` } })).id;
  realSwatchId = (
    await prisma.fabricSwatch.create({
      data: {
        name: `${prefix} real swatch`,
        colorHex: "#000000",
        imageUrl: "https://example.public.blob.vercel-storage.com/real.jpg",
        composition: "Cotton",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { userId } });
  await removeDemoContent(prisma);
  if (!hadHours) await prisma.availabilityRule.deleteMany({});
  await prisma.fabricSwatch.deleteMany({ where: { id: realSwatchId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("demo content (Admin → Settings)", () => {
  it("loads a published sample catalogue once, with every stock badge and a hero", async () => {
    await loadDemoContent(prisma);
    await loadDemoContent(prisma); // a second load adds nothing
    expect(await demoContentSummary(prisma)).toEqual({
      products: 6,
      swatches: 4,
      portfolio: 4,
      zones: 3,
    });

    const products = await prisma.product.findMany({
      where: { slug: { startsWith: "demo-" } },
      include: { images: true },
    });
    expect(products.every((p) => p.isPublished && p.images.length === 1)).toBe(true);
    expect(new Set(products.map((p) => p.inventoryStatus))).toEqual(
      new Set(["AVAILABLE", "LOW_STOCK", "SOLD_OUT"]),
    );
    expect(products.every((p) => p.images[0]!.url.startsWith("/demo/"))).toBe(true);

    const hero = await prisma.portfolioItem.findMany({
      where: { imageUrl: { startsWith: "/demo/" }, tags: { has: "hero" } },
    });
    expect(hero).toHaveLength(1);
    expect(await prisma.availabilityRule.count()).toBeGreaterThan(0);
  });

  it("removes demo content, hides demo products with orders, and keeps real content", async () => {
    const ordered = await prisma.product.findUniqueOrThrow({
      where: { slug: "demo-ankara-two-piece" },
    });
    await prisma.order.create({
      data: {
        userId,
        productId: ordered.id,
        subtotalKobo: ordered.priceKobo,
        totalKobo: ordered.priceKobo,
        fulfillmentMethod: "PICKUP",
        finalSaleAcknowledgedAt: new Date(),
      },
    });

    expect(await removeDemoContent(prisma)).toEqual({ kept: 1 });
    expect(await demoContentSummary(prisma)).toEqual({
      products: 1,
      swatches: 0,
      portfolio: 0,
      zones: 0,
    });
    const kept = await prisma.product.findUniqueOrThrow({ where: { id: ordered.id } });
    expect(kept).toMatchObject({ isPublished: false, quantity: 0, inventoryStatus: "SOLD_OUT" });
    expect(await prisma.fabricSwatch.count({ where: { id: realSwatchId } })).toBe(1);
  });
});
