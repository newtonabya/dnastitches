import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ModerateReviewInput, ReviewInput } from "@/lib/validators/reviews";

/**
 * Reviews (US-H1). Plain Prisma functions. Eligibility is checked here, on the server,
 * and the (userId, productId) / (userId, customOrderId) unique constraints back it up.
 */

type Db = PrismaClient;

const reviewStateSelect = {
  id: true,
  rating: true,
  body: true,
  displayName: true,
  isApproved: true,
  moderatedAt: true,
  createdAt: true,
} as const;

export interface ReviewTarget {
  kind: ReviewInput["kind"];
  id: string;
  label: string;
  reference: string | null;
  productId: string | null;
  customOrderId: string | null;
  existing: {
    id: string;
    rating: number;
    body: string;
    displayName: string;
    isApproved: boolean;
    moderatedAt: Date | null;
    createdAt: Date;
  } | null;
}

/** My own fulfilled shop order or completed custom order, with any review I've left (AC1). */
export async function getReviewTarget(
  db: Db,
  userId: string,
  kind: ReviewInput["kind"],
  targetId: string,
): Promise<ReviewTarget | null> {
  if (kind === "ORDER") {
    const order = await db.order.findFirst({
      where: { id: targetId, userId, status: "FULFILLED" },
      select: { product: { select: { id: true, name: true } } },
    });
    if (!order) return null;
    const existing = await db.review.findUnique({
      where: { userId_productId: { userId, productId: order.product.id } },
      select: reviewStateSelect,
    });
    return {
      kind,
      id: targetId,
      label: order.product.name,
      reference: null,
      productId: order.product.id,
      customOrderId: null,
      existing,
    };
  }
  const order = await db.customOrder.findFirst({
    where: { id: targetId, userId, status: "COMPLETED" },
    select: { id: true, title: true, reference: true },
  });
  if (!order) return null;
  const existing = await db.review.findUnique({
    where: { userId_customOrderId: { userId, customOrderId: order.id } },
    select: reviewStateSelect,
  });
  return {
    kind,
    id: order.id,
    label: order.title,
    reference: order.reference,
    productId: null,
    customOrderId: order.id,
    existing,
  };
}

export type CreateReviewResult =
  { ok: true; reviewId: string } | { ok: false; code: "NOT_FOUND" | "ALREADY_REVIEWED" };

/** AC1–AC2: create a review, hidden until the owner approves it. */
export async function createReview(
  db: Db,
  userId: string,
  input: ReviewInput,
): Promise<CreateReviewResult> {
  const target = await getReviewTarget(db, userId, input.kind, input.targetId);
  if (!target) return { ok: false, code: "NOT_FOUND" };
  if (target.existing) return { ok: false, code: "ALREADY_REVIEWED" };
  try {
    const review = await db.review.create({
      data: {
        userId,
        productId: target.productId,
        customOrderId: target.customOrderId,
        rating: input.rating,
        body: input.body,
        displayName: input.displayName,
      },
      select: { id: true },
    });
    return { ok: true, reviewId: review.id };
  } catch (error) {
    // Two submissions at once: the unique constraint lets only one through.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { ok: false, code: "ALREADY_REVIEWED" };
    throw error;
  }
}

export type ModerateResult =
  { ok: true; productSlug: string | null; isApproved: boolean } | { ok: false; code: "NOT_FOUND" };

/** AC2: approve (publish) or hide. Returns the product slug so its page can be refreshed. */
export async function moderateReview(
  db: Db,
  input: ModerateReviewInput,
  now: Date,
): Promise<ModerateResult> {
  const isApproved = input.decision === "APPROVE";
  const review = await db.review
    .update({
      where: { id: input.reviewId },
      data: { isApproved, moderatedAt: now },
      select: { product: { select: { slug: true } } },
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
        return null;
      throw error;
    });
  if (!review) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, productSlug: review.product?.slug ?? null, isApproved };
}

const publicSelect = {
  id: true,
  rating: true,
  body: true,
  displayName: true,
  createdAt: true,
} as const;

/** AC3: approved reviews for one product, newest first. */
export async function listApprovedProductReviews(db: Db, productId: string) {
  return db.review.findMany({
    where: { productId, isApproved: true },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: publicSelect,
  });
}

/** AC3: home page testimonials: the newest approved reviews of 4 stars or more (public data only). */
export async function listTestimonials(db: Db, limit = 6) {
  return db.review.findMany({
    where: { isApproved: true, rating: { gte: 4 } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      ...publicSelect,
      product: { select: { name: true, slug: true } },
      // Only whether it was custom: request titles are private to the customer.
      customOrderId: true,
    },
  });
}

export type PublicReview = Awaited<ReturnType<typeof listApprovedProductReviews>>[number];
export type Testimonial = Awaited<ReturnType<typeof listTestimonials>>[number];

export type AdminReviewFilter = "pending" | "approved" | "hidden";

/** Admin queue: pending (oldest first, to work through) or approved / hidden (newest first). */
export async function listAdminReviews(db: Db, filter: AdminReviewFilter) {
  return db.review.findMany({
    where:
      filter === "pending"
        ? { isApproved: false, moderatedAt: null }
        : filter === "approved"
          ? { isApproved: true }
          : { isApproved: false, moderatedAt: { not: null } },
    orderBy: { createdAt: filter === "pending" ? "asc" : "desc" },
    take: 200,
    select: {
      ...reviewStateSelect,
      user: { select: { id: true, name: true, email: true } },
      product: { select: { name: true, slug: true } },
      customOrder: { select: { id: true, title: true, reference: true } },
    },
  });
}

export type AdminReview = Awaited<ReturnType<typeof listAdminReviews>>[number];

export async function countPendingReviews(db: Db) {
  return db.review.count({ where: { isApproved: false, moderatedAt: null } });
}

/** My reviews, keyed for My Wardrobe: by product (shop orders) and custom order. */
export async function listUserReviewStates(db: Db, userId: string) {
  return db.review.findMany({
    where: { userId },
    select: { productId: true, customOrderId: true, isApproved: true, moderatedAt: true },
  });
}

/** Everything the owner's "new review" email needs. */
export async function getReviewEmailData(db: Db, reviewId: string) {
  return db.review.findUnique({
    where: { id: reviewId },
    select: {
      rating: true,
      body: true,
      displayName: true,
      user: { select: { email: true } },
      product: { select: { name: true } },
      customOrder: { select: { title: true, reference: true } },
    },
  });
}
