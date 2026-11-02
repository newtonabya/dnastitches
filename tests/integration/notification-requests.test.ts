import { saveNotificationRequests } from "@/server/data/notification-requests";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockHeaders = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/headers", () => ({ headers: () => mockHeaders() }));

const prisma = createTestPrisma();
const prefix = uid("notify");
let productId = "";
let draftId = "";

beforeAll(async () => {
  const base = {
    description: "x",
    priceKobo: 100,
    fabricComposition: "x",
    careInstructions: "x",
    quantity: 0,
    inventoryStatus: "SOLD_OUT" as const,
  };
  productId = (
    await prisma.product.create({
      data: { ...base, slug: `${prefix}-p`, name: "P", isPublished: true },
    })
  ).id;
  draftId = (
    await prisma.product.create({
      data: { ...base, slug: `${prefix}-d`, name: "D", isPublished: false },
    })
  ).id;
});

afterAll(async () => {
  await prisma.notificationRequest.deleteMany({
    where: { productId: { in: [productId, draftId] } },
  });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

const count = (email: string) => prisma.notificationRequest.count({ where: { email, productId } });

describe("saveNotificationRequests (US-D2 AC2)", () => {
  it("writes one row per type and is idempotent", async () => {
    const email = `${prefix}-a@example.com`;
    const input = {
      email,
      productId,
      types: ["RESTOCK", "SIMILAR_FABRIC"] as ("RESTOCK" | "SIMILAR_FABRIC")[],
    };
    expect(await saveNotificationRequests(prisma, input)).toEqual({ ok: true });
    expect(await saveNotificationRequests(prisma, input)).toEqual({ ok: true });
    expect(await count(email)).toBe(2);
  });

  it("links the user on a later signed-in submit without duplicating", async () => {
    const email = `${prefix}-b@example.com`;
    const user = await prisma.user.create({ data: { email } });
    await saveNotificationRequests(prisma, { email, productId, types: ["RESTOCK"] });
    await saveNotificationRequests(prisma, {
      email,
      productId,
      types: ["RESTOCK"],
      userId: user.id,
    });
    const rows = await prisma.notificationRequest.findMany({ where: { email, productId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(user.id);
    await prisma.notificationRequest.deleteMany({ where: { email } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("rejects unpublished or unknown products", async () => {
    const email = `${prefix}-c@example.com`;
    expect(
      await saveNotificationRequests(prisma, { email, productId: draftId, types: ["RESTOCK"] }),
    ).toEqual({
      ok: false,
      reason: "PRODUCT_NOT_FOUND",
    });
    expect(
      await saveNotificationRequests(prisma, { email, productId: "missing", types: ["RESTOCK"] }),
    ).toEqual({
      ok: false,
      reason: "PRODUCT_NOT_FOUND",
    });
  });
});

describe("createNotificationRequest action (US-D2)", () => {
  const form = (fields: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const item of [v].flat()) fd.append(k, item);
    return fd;
  };

  it("validates input, returns the same success message twice, and rate-limits per IP (AC2–3)", async () => {
    const { createNotificationRequest } = await import("@/server/actions/notification-request");
    const { NOTIFY_SUCCESS_MESSAGE } = await import("@/lib/validators/notification-request");
    mockAuth.mockResolvedValue(null);
    mockHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250)}` }),
    );
    const email = `${prefix}-d@example.com`;

    const invalid = await createNotificationRequest(
      null,
      form({ email: "bad", productId, types: [] }),
    );
    expect(invalid).toEqual({
      ok: false,
      fieldErrors: { email: "Enter a valid email address", types: "Choose at least one option" },
    });

    const valid = form({ email, productId, types: ["RESTOCK"] });
    expect(await createNotificationRequest(null, valid)).toEqual({
      ok: true,
      message: NOTIFY_SUCCESS_MESSAGE,
    });
    expect(await createNotificationRequest(null, valid)).toEqual({
      ok: true,
      message: NOTIFY_SUCCESS_MESSAGE,
    });
    expect(await count(email)).toBe(1);

    // 3 requests used so far; 2 more allowed, then blocked.
    await createNotificationRequest(null, valid);
    await createNotificationRequest(null, valid);
    expect(await createNotificationRequest(null, valid)).toEqual({
      ok: false,
      formError: "Too many requests. Please try again in a few minutes.",
    });
  });

  it("links the signed-in user", async () => {
    const { createNotificationRequest } = await import("@/server/actions/notification-request");
    const email = `${prefix}-e@example.com`;
    const user = await prisma.user.create({ data: { email } });
    mockAuth.mockResolvedValue({ user: { id: user.id, email, role: "CUSTOMER" } });
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.7" }));

    expect(
      (await createNotificationRequest(null, form({ email, productId, types: ["SIMILAR_FABRIC"] })))
        .ok,
    ).toBe(true);
    const row = await prisma.notificationRequest.findFirst({ where: { email, productId } });
    expect(row?.userId).toBe(user.id);
    await prisma.notificationRequest.deleteMany({ where: { email } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
