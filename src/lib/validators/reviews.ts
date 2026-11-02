import { z } from "zod";

import { MAX_RATING, MIN_RATING } from "@/lib/reviews";

const id = z.string().trim().min(1).max(64);

/** US-H1 AC1: one review per fulfilled shop order or completed custom order. */
export const reviewSchema = z.object({
  kind: z.enum(["ORDER", "CUSTOM_ORDER"], { error: "Unknown order type" }),
  targetId: id,
  rating: z.coerce
    .number({ error: "Choose a rating" })
    .int("Choose a rating")
    .min(MIN_RATING, "Choose a rating")
    .max(MAX_RATING, "Choose a rating"),
  body: z
    .string({ error: "Tell us about your piece" })
    .trim()
    .min(10, "Please write at least 10 characters")
    .max(1500, "Reviews must be 1,500 characters or fewer"),
  displayName: z
    .string({ error: "Add the name to show with your review" })
    .trim()
    .min(1, "Add the name to show with your review")
    .max(60, "Name must be 60 characters or fewer"),
});
export type ReviewInput = z.output<typeof reviewSchema>;

/** US-H1 AC2: the owner approves (publishes) or hides a review. */
export const moderateReviewSchema = z.object({
  reviewId: id,
  decision: z.enum(["APPROVE", "HIDE"], { error: "Choose approve or hide" }),
});
export type ModerateReviewInput = z.output<typeof moderateReviewSchema>;
