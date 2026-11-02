import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  type PublicReview,
  type Testimonial,
  listApprovedProductReviews,
  listTestimonials,
} from "@/server/data/reviews";

/** Cache tag for every public review read. Moderation (US-H1 AC2) must `updateTag` it. */
export const REVIEWS_TAG = "reviews";

export async function getProductReviews(productId: string): Promise<PublicReview[]> {
  "use cache";
  cacheTag(REVIEWS_TAG);
  cacheLife("minutes");
  return listApprovedProductReviews(prisma, productId);
}

export async function getTestimonials(): Promise<Testimonial[]> {
  "use cache";
  cacheTag(REVIEWS_TAG);
  cacheLife("minutes");
  return listTestimonials(prisma);
}
