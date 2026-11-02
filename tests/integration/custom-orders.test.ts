import { parseReference } from "@/lib/custom-order/reference";
import { makeCustomOrderRequestSchema } from "@/lib/validators/custom-order";
import { PREFILL_NOT_FOUND_NOTICE, resolveCustomRequestPrefill } from "@/server/custom/prefill";
import { APPOINTMENT_NOTE, createCustomOrderRequest } from "@/server/data/custom-orders";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockAfter = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));

const prisma = createTestPrisma();
const prefix = uid("custom");
const schema = makeCustomOrderRequestSchema({
  now: () => new Date(),
  minLeadTimeDays: 14,
  timeZone: "Africa/Lagos",
});

const ids = {
  alice: "",
  bob: "",
  product: "",
  draftProduct: "",
  swatch: "",
  swatchOff: "",
  portfolio: "",
  aliceAddress: "",
  bobAddress: "",
  bobProfile: "",
};

beforeAll(async () => {
  ids.alice = (
    await prisma.user.create({ data: { email: `${prefix}-alice@example.com`, name: "Alice" } })
  ).id;
  ids.bob = (await prisma.user.create({ data: { email: `${prefix}-bob@example.com` } })).id;
  ids.swatch = (
    await prisma.fabricSwatch.create({
      data: {
        id: `${prefix}-sw`,
        name: "Indigo",
        colorHex: "#223388",
        imageUrl: "https://placehold.co/s.png",
        composition: "Cotton",
      },
    })
  ).id;
  ids.swatchOff = (
    await prisma.fabricSwatch.create({
      data: {
        id: `${prefix}-sw-off`,
        name: "Gone",
        colorHex: "#000000",
        imageUrl: "https://placehold.co/g.png",
        composition: "x",
        isAvailable: false,
      },
    })
  ).id;
  const base = {
    description: "x",
    priceKobo: 100,
    fabricComposition: "x",
    careInstructions: "x",
    quantity: 0,
    inventoryStatus: "SOLD_OUT" as const,
  };
  ids.product = (
    await prisma.product.create({
      data: {
        ...base,
        slug: `${prefix}-p`,
        name: "Adire Maxi Skirt",
        isPublished: true,
        fabricSwatchId: ids.swatch,
        images: {
          create: [
            { url: "https://placehold.co/p2.png", alt: "b", sortOrder: 1 },
            { url: "https://placehold.co/p1.png", alt: "a", sortOrder: 0 },
          ],
        },
      },
    })
  ).id;
  ids.draftProduct = (
    await prisma.product.create({
      data: { ...base, slug: `${prefix}-draft`, name: "Draft", isPublished: false },
    })
  ).id;
  ids.portfolio = (
    await prisma.portfolioItem.create({
      data: {
        id: `${prefix}-pf`,
        title: "Bridal Ensemble",
        description: "x",
        imageUrl: "https://placehold.co/pf.png",
        tags: [],
        isPublished: true,
      },
    })
  ).id;
  const address = {
    recipientName: "R",
    phone: "+2348031234567",
    line1: "1 Road",
    city: "Ikeja",
    state: "Lagos",
  };
  ids.aliceAddress = (await prisma.address.create({ data: { ...address, userId: ids.alice } })).id;
  ids.bobAddress = (await prisma.address.create({ data: { ...address, userId: ids.bob } })).id;
  ids.bobProfile = (
    await prisma.measurementProfile.create({
      data: { userId: ids.bob, label: "Bob", unit: "CM", bust: 100, waist: 90, hips: 100 },
    })
  ).id;
});

afterAll(async () => {
  const users = [ids.alice, ids.bob];
  await prisma.customOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.measurementProfile.deleteMany({ where: { userId: { in: users } } });
  await prisma.address.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.portfolioItem.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.fabricSwatch.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe("resolveCustomRequestPrefill (US-A3 / US-B2)", () => {
  it("pre-fills from a product: title, primary image, swatch, source", async () => {
    expect(await resolveCustomRequestPrefill(prisma, { fromProduct: ids.product })).toEqual({
      title: "Custom version of Adire Maxi Skirt",
      referenceImageUrls: ["https://placehold.co/p1.png", "https://placehold.co/p2.png"].slice(
        0,
        1,
      ),
      fabricSwatchId: ids.swatch,
      fromProductId: ids.product,
    });
  });

  it("pre-fills from a portfolio item", async () => {
    expect(await resolveCustomRequestPrefill(prisma, { fromPortfolio: ids.portfolio })).toEqual({
      title: "Inspired by Bridal Ensemble",
      referenceImageUrls: ["https://placehold.co/pf.png"],
      fromPortfolioId: ids.portfolio,
    });
  });

  it.each([
    [{ fromProduct: "does-not-exist" }],
    [{ fromPortfolio: "does-not-exist" }],
    [{ fromProduct: "x".repeat(500) }],
  ])("falls back to an empty form with a notice for %j (US-B2 AC5)", async (source) => {
    expect(await resolveCustomRequestPrefill(prisma, source)).toEqual({
      referenceImageUrls: [],
      notice: PREFILL_NOT_FOUND_NOTICE,
    });
  });

  it("treats unpublished products as not found, and empty input as a blank form", async () => {
    expect(
      (await resolveCustomRequestPrefill(prisma, { fromProduct: ids.draftProduct })).notice,
    ).toBe(PREFILL_NOT_FOUND_NOTICE);
    expect(await resolveCustomRequestPrefill(prisma, {})).toEqual({ referenceImageUrls: [] });
  });
});

const request = (overrides: Record<string, unknown> = {}) =>
  schema.parse({
    design: {
      title: "Custom version of Adire Maxi Skirt",
      description: "Ankle length, same pleats please.",
      referenceImageUrls: ["https://placehold.co/p1.png"],
    },
    fabric: { fabricSwatchId: ids.swatch },
    measurements: {
      mode: "new",
      profile: { label: "Wedding", unit: "CM", bust: "90", waist: "70", hips: "98" },
    },
    fulfilment: { fulfillmentMethod: "PICKUP" },
    source: { fromProductId: ids.product },
    ...overrides,
  });

describe("createCustomOrderRequest (US-B1)", () => {
  it("creates the order, a new measurement profile and the first status log in one go (AC5–6, US-A3 AC4)", async () => {
    const result = await createCustomOrderRequest(prisma, ids.alice, request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseReference(result.reference)).not.toBeNull();

    const order = await prisma.customOrder.findUniqueOrThrow({
      where: { id: result.id },
      include: { statusLogs: true, measurementProfile: true },
    });
    expect(order).toMatchObject({
      userId: ids.alice,
      status: "REQUEST_RECEIVED",
      sourceProductId: ids.product,
      fabricSwatchId: ids.swatch,
      fulfillmentMethod: "PICKUP",
      referenceImageUrls: ["https://placehold.co/p1.png"],
    });
    expect(order.measurementProfile).toMatchObject({
      userId: ids.alice,
      label: "Wedding",
      takenBy: "SELF",
      isDefault: true,
    });
    expect(order.statusLogs).toEqual([
      expect.objectContaining({
        fromStatus: null,
        toStatus: "REQUEST_RECEIVED",
        changedById: ids.alice,
      }),
    ]);
  });

  it("records the portfolio source, 'advise me' fabric, appointment choice and delivery address", async () => {
    const result = await createCustomOrderRequest(
      prisma,
      ids.alice,
      request({
        design: {
          title: "Inspired by Bridal Ensemble",
          description: "Something like this for my wedding.",
          referenceImageUrls: ["https://placehold.co/pf.png"],
        },
        fabric: { fabricSwatchId: null },
        measurements: { mode: "appointment" },
        fulfilment: { fulfillmentMethod: "DELIVERY", addressId: ids.aliceAddress },
        source: { fromPortfolioId: ids.portfolio },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await prisma.customOrder.findUnique({ where: { id: result.id } })).toMatchObject({
      portfolioItemId: ids.portfolio,
      sourceProductId: null,
      fabricSwatchId: null,
      measurementProfileId: null,
      adminNotes: APPOINTMENT_NOTE,
      fulfillmentMethod: "DELIVERY",
      addressId: ids.aliceAddress,
    });
  });

  it("rejects other users' profiles and addresses, unavailable fabric, and foreign image URLs", async () => {
    expect(
      await createCustomOrderRequest(
        prisma,
        ids.alice,
        request({ measurements: { mode: "existing", profileId: ids.bobProfile } }),
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { "measurements.profileId": "Choose one of your saved profiles." },
    });
    expect(
      await createCustomOrderRequest(
        prisma,
        ids.alice,
        request({ fulfilment: { fulfillmentMethod: "DELIVERY", addressId: ids.bobAddress } }),
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { "fulfilment.addressId": "Choose one of your saved addresses." },
    });
    expect(
      await createCustomOrderRequest(
        prisma,
        ids.alice,
        request({ fabric: { fabricSwatchId: ids.swatchOff } }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { "fabric.fabricSwatchId": expect.any(String) },
    });
    const foreign = request({
      design: {
        title: "T",
        description: "Long enough description",
        referenceImageUrls: ["https://evil.example/x.png"],
      },
    });
    expect(await createCustomOrderRequest(prisma, ids.alice, foreign)).toMatchObject({
      ok: false,
      fieldErrors: { "design.referenceImageUrls.0": expect.any(String) },
    });
  });

  it("generates unique, sequential references even when requests race (DoD)", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        createCustomOrderRequest(
          prisma,
          ids.bob,
          request({ measurements: { mode: "appointment" } }),
        ),
      ),
    );
    const refs = results.map((r) => (r.ok ? r.reference : "failed"));
    expect(refs).not.toContain("failed");
    expect(new Set(refs).size).toBe(4);
  });
});

describe("submitCustomOrder action", () => {
  it("requires sign-in, validates with the shared schema, and queues emails after success", async () => {
    const { submitCustomOrder } = await import("@/server/actions/custom-order");

    mockAuth.mockResolvedValue(null);
    expect(await submitCustomOrder({})).toEqual({
      ok: false,
      formError: "Please sign in to submit your request.",
    });

    mockAuth.mockResolvedValue({ user: { id: ids.alice, role: "CUSTOMER" } });
    const invalid = await submitCustomOrder({ design: { title: "" } });
    expect(invalid).toMatchObject({
      ok: false,
      fieldErrors: { "design.title": "Title is required" },
    });

    mockAfter.mockClear();
    const ok = await submitCustomOrder({
      design: {
        title: "Custom version",
        description: "Please make it in green.",
        referenceImageUrls: [],
      },
      fabric: { fabricSwatchId: null },
      measurements: { mode: "appointment" },
      fulfilment: { fulfillmentMethod: "PICKUP" },
    });
    expect(ok).toEqual({
      ok: true,
      data: { reference: expect.stringMatching(/^DNA-\d{4}-\d{4,}$/) },
    });
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });
});
