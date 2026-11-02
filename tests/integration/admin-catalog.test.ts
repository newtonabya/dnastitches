import {
  productSchema,
  portfolioSchema,
  swatchSchema,
  deliveryZoneSchema,
} from "@/lib/validators/catalog";
import {
  createPortfolioItem,
  createProduct,
  createSwatch,
  getAdminProduct,
  listAdminProducts,
  markProductSoldOut,
  updatePortfolioItem,
  updateProduct,
  updateSwatch,
} from "@/server/data/admin/catalog";
import {
  createDeliveryZone,
  listDeliveryZones,
  overlappingStates,
  updateDeliveryZone,
} from "@/server/data/admin/settings";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockUpdateTag = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  updateTag: (t: string) => mockUpdateTag(t),
}));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const prisma = createTestPrisma();
const prefix = uid("catalog");
const blob = (name: string) => `https://test.public.blob.vercel-storage.com/${prefix}/${name}`;
let admin = "";
let customer = "";

const productInput = (name: string, extra: Record<string, unknown> = {}) =>
  productSchema.parse({
    name,
    description: "A piece.",
    priceNaira: "100,000",
    quantity: "1",
    fabricComposition: "Cotton",
    careInstructions: "Dry clean.",
    images: JSON.stringify([{ url: blob("a.jpg"), alt: "Front" }]),
    ...extra,
  });

beforeAll(async () => {
  admin = (await prisma.user.create({ data: { email: `${prefix}-a@example.com`, role: "ADMIN" } }))
    .id;
  customer = (await prisma.user.create({ data: { email: `${prefix}-c@example.com` } })).id;
});

afterAll(async () => {
  await prisma.notificationRequest.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.portfolioItem.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.fabricSwatch.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.deliveryZone.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin, customer] } } });
  await prisma.$disconnect();
});

describe("products (US-C3)", () => {
  it("creates with a unique slug from the name and derived inventory status", async () => {
    const a = await createProduct(prisma, productInput(`${prefix} Wrap Dress`, { quantity: "3" }));
    const b = await createProduct(prisma, productInput(`${prefix} Wrap Dress`));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.slug).toBe(`${a.slug}-2`);
    expect(await getAdminProduct(prisma, a.id)).toMatchObject({
      quantity: 3,
      inventoryStatus: "AVAILABLE",
      isPublished: false,
    });
    expect(await getAdminProduct(prisma, b.id)).toMatchObject({ inventoryStatus: "LOW_STOCK" });
  });

  it("keeps the slug on rename unless regeneration is requested (AC3)", async () => {
    const created = await createProduct(prisma, productInput(`${prefix} Kaftan`));
    if (!created.ok) throw new Error("create failed");
    const renamed = await updateProduct(prisma, created.id, productInput(`${prefix} Linen Kaftan`));
    expect(renamed).toEqual({ ok: true, oldSlug: created.slug, slug: created.slug });
    const regenerated = await updateProduct(
      prisma,
      created.id,
      productInput(`${prefix} Linen Kaftan`, { regenerateSlug: "on" }),
    );
    expect(regenerated).toMatchObject({
      ok: true,
      oldSlug: created.slug,
      slug: expect.stringContaining("linen-kaftan"),
    });
  });

  it("replaces and reorders images; only uploads or the item's existing images are accepted", async () => {
    const created = await createProduct(prisma, productInput(`${prefix} Corset`));
    if (!created.ok) throw new Error("create failed");
    const images = [
      { url: blob("b.jpg"), alt: "Back" },
      { url: blob("a.jpg"), alt: "Front" },
    ];
    await updateProduct(
      prisma,
      created.id,
      productInput(`${prefix} Corset`, { images: JSON.stringify(images) }),
    );
    expect((await getAdminProduct(prisma, created.id))?.images).toEqual(images);

    expect(
      await updateProduct(
        prisma,
        created.id,
        productInput(`${prefix} Corset`, {
          images: JSON.stringify([{ url: "https://evil.example/x.jpg", alt: "x" }]),
        }),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { "images.0.url": expect.any(String) } });
    expect(
      await createProduct(
        prisma,
        productInput(`${prefix} Bad`, {
          images: JSON.stringify([{ url: "https://placehold.co/x.png", alt: "x" }]),
        }),
      ),
    ).toMatchObject({
      ok: false,
    });
  });

  it("rejects unknown swatches and reports not-found", async () => {
    expect(
      await createProduct(prisma, productInput(`${prefix} Swatchless`, { fabricSwatchId: "nope" })),
    ).toEqual({
      ok: false,
      fieldErrors: { fabricSwatchId: "Choose a swatch from the list." },
    });
    expect(await updateProduct(prisma, "missing", productInput(`${prefix} X`))).toEqual({
      ok: false,
      notFound: true,
    });
  });

  it("marks a piece sold out (AC2) and lists unpublished products for admins", async () => {
    const created = await createProduct(
      prisma,
      productInput(`${prefix} Sold`, { quantity: "2", isPublished: "on" }),
    );
    if (!created.ok) throw new Error("create failed");
    expect(await markProductSoldOut(prisma, created.id)).toEqual({ slug: created.slug });
    expect(await getAdminProduct(prisma, created.id)).toMatchObject({
      quantity: 0,
      inventoryStatus: "SOLD_OUT",
    });
    expect(await markProductSoldOut(prisma, "missing")).toBeNull();
    const listed = await listAdminProducts(prisma);
    expect(listed.filter((p) => p.name.startsWith(prefix)).some((p) => !p.isPublished)).toBe(true);
  });
});

describe("swatches and portfolio (US-C3)", () => {
  const swatch = (name: string, imageUrl = blob("s.jpg")) =>
    swatchSchema.parse({
      name,
      colorHex: "#112233",
      imageUrl,
      composition: "Silk",
      isAvailable: "on",
    });

  it("creates and updates swatches, keeping existing images allowed", async () => {
    const created = await createSwatch(prisma, swatch(`${prefix} Silk`));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await updateSwatch(prisma, created.id, swatch(`${prefix} Silk 2`))).toEqual({
      ok: true,
    });
    expect(
      await updateSwatch(
        prisma,
        created.id,
        swatch(`${prefix} Silk 2`, "https://evil.example/x.png"),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await createSwatch(prisma, swatch(`${prefix} Bad`, "https://evil.example/x.png")),
    ).toMatchObject({ ok: false });
  });

  it("creates and updates portfolio items with an optional source product", async () => {
    const item = portfolioSchema.parse({
      title: `${prefix} Gown`,
      description: "x",
      imageUrl: blob("p.jpg"),
      tags: "Bridal, Silk",
      isPublished: "on",
    });
    const created = await createPortfolioItem(prisma, item);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(
      await updatePortfolioItem(prisma, created.id, { ...item, sourceProductId: "missing" }),
    ).toEqual({
      ok: false,
      fieldErrors: { sourceProductId: "Choose a product from the list." },
    });
    expect(await updatePortfolioItem(prisma, created.id, { ...item, isPublished: false })).toEqual({
      ok: true,
    });
    expect(await prisma.portfolioItem.findUnique({ where: { id: created.id } })).toMatchObject({
      tags: ["bridal", "silk"],
      isPublished: false,
    });
  });
});

describe("delivery zones (D-12)", () => {
  it("creates, updates and flags overlapping active zones", async () => {
    const z = deliveryZoneSchema.parse({
      name: `${prefix} Lagos`,
      states: ["Lagos"],
      feeNaira: "3500",
      etaDays: "2",
      isActive: "on",
    });
    const { id } = await createDeliveryZone(prisma, z);
    expect(await updateDeliveryZone(prisma, id, { ...z, feeNaira: 400_000 })).toBe(true);
    expect(await updateDeliveryZone(prisma, "missing", z)).toBe(false);
    const zones = (await listDeliveryZones(prisma)).filter((zone) => zone.name.startsWith(prefix));
    expect(zones[0]).toMatchObject({ feeKobo: 400_000, states: ["Lagos"] });

    expect(
      overlappingStates([
        { name: "A", states: ["Lagos", "Ogun"], isActive: true },
        { name: "B", states: ["Lagos"], isActive: true },
        { name: "C", states: ["Ogun"], isActive: false },
      ]),
    ).toEqual(new Map([["Lagos", ["A", "B"]]]));
  });
});

describe("catalog actions", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const item of [v].flat()) fd.append(k, item);
    return fd;
  };

  it("refuse non-admins", async () => {
    const actions = await import("@/server/actions/admin/catalog");
    const { saveDeliveryZoneAction } = await import("@/server/actions/admin/settings");
    mockAuth.mockResolvedValue({ user: { id: customer, role: "ADMIN" } });
    const denied = { ok: false, formError: "You don't have access to do that." };
    expect(await actions.createProductAction(null, form({}))).toEqual(denied);
    expect(await actions.updateProductAction(null, form({}))).toEqual(denied);
    expect(await actions.markProductSoldOutAction(null, form({}))).toEqual(denied);
    expect(await actions.saveSwatchAction(null, form({}))).toEqual(denied);
    expect(await actions.savePortfolioItemAction(null, form({}))).toEqual(denied);
    expect(await actions.exportNotifyRequestsCsvAction("x")).toEqual(denied);
    expect(await saveDeliveryZoneAction(null, form({}))).toEqual(denied);
  });

  it("creates a product, redirects to it, and invalidates the shop caches", async () => {
    const { createProductAction, updateProductAction } =
      await import("@/server/actions/admin/catalog");
    mockAuth.mockResolvedValue({ user: { id: admin, role: "ADMIN" } });
    mockUpdateTag.mockClear();
    const fields = {
      name: `${prefix} Action Dress`,
      description: "x",
      priceNaira: "50000",
      quantity: "1",
      fabricComposition: "Cotton",
      careInstructions: "x",
      isPublished: "on",
      images: JSON.stringify([{ url: blob("c.jpg"), alt: "Front" }]),
    };
    const error = await createProductAction(null, form(fields)).catch((e: { url?: string }) => e);
    expect((error as { url: string }).url).toMatch(/^\/admin\/products\/.+\?created=1$/);
    expect(mockUpdateTag).toHaveBeenCalledWith("products");

    const id = (error as { url: string }).url.split("/")[3]!.split("?")[0]!;
    expect(
      await updateProductAction(null, form({ ...fields, productId: id, priceNaira: "" })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { priceNaira: "Price is required" },
    });
    expect(
      await updateProductAction(null, form({ ...fields, productId: id, quantity: "0" })),
    ).toEqual({ ok: true, message: "Saved." });
    expect(await getAdminProduct(prisma, id)).toMatchObject({ inventoryStatus: "SOLD_OUT" });
  });

  it("exports notify-me requests as CSV (US-D2 AC4)", async () => {
    const { exportNotifyRequestsCsvAction } = await import("@/server/actions/admin/catalog");
    mockAuth.mockResolvedValue({ user: { id: admin, role: "ADMIN" } });
    const created = await createProduct(prisma, productInput(`${prefix} Notify`));
    if (!created.ok) throw new Error("create failed");
    await prisma.notificationRequest.createMany({
      data: [
        { email: `${prefix}-x@example.com`, productId: created.id, type: "RESTOCK" },
        { email: `=cmd${prefix}@example.com`, productId: created.id, type: "SIMILAR_FABRIC" },
      ],
    });
    const result = await exportNotifyRequestsCsvAction(created.id);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    expect(result.data.filename).toBe(`notify-requests-${created.slug}.csv`);
    const lines = result.data.csv.trim().split("\r\n");
    expect(lines[0]).toBe("email,name,type,requested_at,notified_at");
    expect(lines[1]).toMatch(new RegExp(`^${prefix}-x@example.com,,RESTOCK,`));
    expect(lines[2]).toMatch(/^'=cmd/);
    await prisma.notificationRequest.deleteMany({ where: { productId: created.id } });
  });

  it("saves delivery zones from multi-select states", async () => {
    const { saveDeliveryZoneAction } = await import("@/server/actions/admin/settings");
    mockAuth.mockResolvedValue({ user: { id: admin, role: "ADMIN" } });
    expect(
      await saveDeliveryZoneAction(
        null,
        form({
          name: `${prefix} SW`,
          states: ["Ogun", "Oyo"],
          feeNaira: "6000",
          etaDays: "4",
          isActive: "on",
        }),
      ),
    ).toEqual({ ok: true, message: "Zone added." });
    expect(await prisma.deliveryZone.findFirst({ where: { name: `${prefix} SW` } })).toMatchObject({
      states: ["Ogun", "Oyo"],
      feeKobo: 600_000,
    });
    expect(
      await saveDeliveryZoneAction(
        null,
        form({ name: `${prefix} SW`, feeNaira: "1", etaDays: "1" }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { states: "Choose at least one state" },
    });
  });
});
