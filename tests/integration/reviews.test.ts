import {
  countPendingReviews,
  createReview,
  getReviewTarget,
  listAdminReviews,
  listApprovedProductReviews,
  listTestimonials,
  moderateReview,
} from "@/server/data/reviews";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockAfter = jest.fn();
const mockUpdateTag = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  updateTag: (t: string) => mockUpdateTag(t),
  cacheTag: jest.fn(),
  cacheLife: jest.fn(),
}));
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const prisma = createTestPrisma();
const prefix = uid("reviews");
let ada = "";
let bola = "";
let admin = "";
let seq = 0;

async function product() {
  return prisma.product.create({
    data: {
      slug: `${prefix}-${++seq}`,
      name: `Piece ${seq}`,
      description: "x",
      priceKobo: 1000,
      quantity: 0,
      inventoryStatus: "SOLD_OUT",
      fabricComposition: "x",
      careInstructions: "x",
    },
  });
}

async function shopOrder(userId: string, status: "PAID" | "FULFILLED" = "FULFILLED") {
  const p = await product();
  const order = await prisma.order.create({
    data: {
      userId,
      productId: p.id,
      subtotalKobo: 1000,
      totalKobo: 1000,
      status,
      fulfillmentMethod: "PICKUP",
      finalSaleAcknowledgedAt: new Date(),
      fulfilledAt: status === "FULFILLED" ? new Date() : null,
    },
  });
  return { order, product: p };
}

async function customOrder(userId: string, status: "READY" | "COMPLETED" = "COMPLETED") {
  return prisma.customOrder.create({
    data: {
      reference: `${prefix}-c${++seq}`,
      userId,
      status,
      title: "Wedding gown",
      description: "x",
    },
  });
}

const review = (kind: "ORDER" | "CUSTOM_ORDER", targetId: string, rating = 5) => ({
  kind,
  targetId,
  rating,
  body: "Beautiful work, it fits perfectly.",
  displayName: "Ada O.",
});

beforeAll(async () => {
  [ada, bola, admin] = (await Promise.all(
    ["ada", "bola", "admin"].map(
      async (l) =>
        (
          await prisma.user.create({
            data: {
              email: `${prefix}-${l}@example.com`,
              name: l,
              role: l === "admin" ? "ADMIN" : "CUSTOMER",
            },
          })
        ).id,
    ),
  )) as [string, string, string];
});

afterAll(async () => {
  const users = [ada, bola, admin];
  await prisma.review.deleteMany({ where: { userId: { in: users } } });
  await prisma.order.deleteMany({ where: { userId: { in: users } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("eligibility and one review per order (AC1)", () => {
  it("lets the owner of a fulfilled shop order review it once, hidden until approved", async () => {
    const { order, product: p } = await shopOrder(ada);
    const result = await createReview(prisma, ada, review("ORDER", order.id));
    expect(result.ok).toBe(true);
    const saved = await prisma.review.findUniqueOrThrow({
      where: { id: result.ok ? result.reviewId : "" },
    });
    expect(saved).toMatchObject({
      productId: p.id,
      customOrderId: null,
      rating: 5,
      isApproved: false,
      moderatedAt: null,
      displayName: "Ada O.",
    });
    expect(await createReview(prisma, ada, review("ORDER", order.id))).toEqual({
      ok: false,
      code: "ALREADY_REVIEWED",
    });
    expect((await getReviewTarget(prisma, ada, "ORDER", order.id))!.existing).toMatchObject({
      rating: 5,
    });
  });

  it("works for completed custom orders; refuses unfinished orders and other people's", async () => {
    const done = await customOrder(ada);
    const ready = await customOrder(ada, "READY");
    const { order: paid } = await shopOrder(ada, "PAID");
    expect((await createReview(prisma, ada, review("CUSTOM_ORDER", done.id, 4))).ok).toBe(true);
    expect(await createReview(prisma, ada, review("CUSTOM_ORDER", ready.id))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await createReview(prisma, ada, review("ORDER", paid.id))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await createReview(prisma, bola, review("CUSTOM_ORDER", done.id))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("two simultaneous submissions create exactly one review (DB unique constraint)", async () => {
    const { order } = await shopOrder(bola);
    const results = await Promise.all(
      [1, 2, 3].map(() => createReview(prisma, bola, review("ORDER", order.id))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "ALREADY_REVIEWED")).toBe(
      true,
    );
  });
});

describe("moderation and display (AC2–AC3)", () => {
  it("shows only approved reviews; hidden ones leave the pending queue", async () => {
    const { order, product: p } = await shopOrder(ada);
    const r = await createReview(prisma, ada, review("ORDER", order.id, 3));
    const id = r.ok ? r.reviewId : "";
    expect(await listApprovedProductReviews(prisma, p.id)).toEqual([]);
    expect((await listAdminReviews(prisma, "pending")).some((x) => x.id === id)).toBe(true);
    expect(await countPendingReviews(prisma)).toBeGreaterThan(0);

    expect(await moderateReview(prisma, { reviewId: id, decision: "APPROVE" }, new Date())).toEqual(
      { ok: true, productSlug: p.slug, isApproved: true },
    );
    expect((await listApprovedProductReviews(prisma, p.id)).map((x) => x.id)).toEqual([id]);
    expect((await listAdminReviews(prisma, "approved")).some((x) => x.id === id)).toBe(true);
    // 3 stars: published on the product, but not a home-page testimonial.
    expect((await listTestimonials(prisma, 200)).some((x) => x.id === id)).toBe(false);

    await moderateReview(prisma, { reviewId: id, decision: "HIDE" }, new Date());
    expect(await listApprovedProductReviews(prisma, p.id)).toEqual([]);
    expect((await listAdminReviews(prisma, "hidden")).some((x) => x.id === id)).toBe(true);
    expect((await listAdminReviews(prisma, "pending")).some((x) => x.id === id)).toBe(false);
    expect(
      await moderateReview(prisma, { reviewId: "missing", decision: "HIDE" }, new Date()),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("features approved 4–5 star reviews as testimonials, never exposing emails", async () => {
    const c = await customOrder(bola);
    const r = await createReview(prisma, bola, {
      ...review("CUSTOM_ORDER", c.id, 5),
      displayName: "Bola A.",
    });
    await moderateReview(
      prisma,
      { reviewId: r.ok ? r.reviewId : "", decision: "APPROVE" },
      new Date(),
    );
    const featured = (await listTestimonials(prisma, 200)).find(
      (x) => x.id === (r.ok ? r.reviewId : ""),
    );
    expect(featured).toMatchObject({
      displayName: "Bola A.",
      rating: 5,
      customOrderId: c.id,
    });
    expect(JSON.stringify(featured)).not.toContain("@example.com");
    expect(JSON.stringify(featured)).not.toContain("Wedding gown");
  });
});

describe("Server Actions", () => {
  const fd = (fields: Record<string, string | number>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
    return f;
  };

  it("createReviewAction: signed in, validated, redirects and emails the owner", async () => {
    const { createReviewAction } = await import("@/server/actions/reviews");
    const { order } = await shopOrder(ada);
    mockAuth.mockResolvedValue(null);
    expect(await createReviewAction(null, fd(review("ORDER", order.id)))).toEqual({
      ok: false,
      formError: "Please sign in to leave a review.",
    });
    mockAuth.mockResolvedValue({ user: { id: ada } });
    expect(
      await createReviewAction(null, fd({ ...review("ORDER", order.id), rating: "" })),
    ).toEqual({ ok: false, fieldErrors: { rating: "Choose a rating" } });
    mockAuth.mockResolvedValue({ user: { id: bola } });
    expect(await createReviewAction(null, fd(review("ORDER", order.id)))).toEqual({
      ok: false,
      formError: "Reviews open once your piece has been collected or delivered.",
    });
    mockAuth.mockResolvedValue({ user: { id: ada } });
    mockAfter.mockClear();
    await expect(createReviewAction(null, fd(review("ORDER", order.id)))).rejects.toMatchObject({
      url: "/account/wardrobe?review=sent",
    });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(await createReviewAction(null, fd(review("ORDER", order.id)))).toEqual({
      ok: false,
      formError: "You've already reviewed this piece. Thank you!",
    });
  });

  it("moderateReviewAction: admins only; refreshes the public review caches", async () => {
    const { moderateReviewAction } = await import("@/server/actions/admin/reviews");
    const { order, product: p } = await shopOrder(bola);
    const r = await createReview(prisma, bola, review("ORDER", order.id));
    const reviewId = r.ok ? r.reviewId : "";
    mockAuth.mockResolvedValue({ user: { id: bola } });
    expect(await moderateReviewAction(null, fd({ reviewId, decision: "APPROVE" }))).toEqual({
      ok: false,
      formError: "You don't have access to do that.",
    });
    mockAuth.mockResolvedValue({ user: { id: admin } });
    mockUpdateTag.mockClear();
    await expect(
      moderateReviewAction(null, fd({ reviewId, decision: "APPROVE", show: "pending" })),
    ).rejects.toMatchObject({
      url: "/admin/reviews?moderated=approved",
    });
    expect(mockUpdateTag.mock.calls.map((c) => c[0])).toEqual(["reviews", `product:${p.slug}`]);
    await expect(
      moderateReviewAction(null, fd({ reviewId, decision: "HIDE", show: "approved" })),
    ).rejects.toMatchObject({
      url: "/admin/reviews?moderated=hidden&show=approved",
    });
    expect(await moderateReviewAction(null, fd({ reviewId, decision: "NOPE" }))).toEqual({
      ok: false,
      formError: "Choose approve or hide.",
    });
  });
});
