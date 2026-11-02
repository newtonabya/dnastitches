/** Reviews (US-H1): pure helpers shared by forms, pages and tests. */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export type ReviewState = "PENDING" | "APPROVED" | "HIDDEN";

/** Pending until the owner looks at it; then approved (public) or hidden. */
export function reviewState(review: {
  isApproved: boolean;
  moderatedAt: Date | null;
}): ReviewState {
  if (review.isApproved) return "APPROVED";
  return review.moderatedAt ? "HIDDEN" : "PENDING";
}

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  PENDING: "Waiting for approval",
  APPROVED: "Published",
  HIDDEN: "Not published",
};

/**
 * A privacy-friendly default public name: first name and last initial ("Ada Okafor" →
 * "Ada O."). The customer can change it before submitting.
 */
export function defaultDisplayName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first!;
}

/** "4 out of 5 stars" — the accessible name for a star display. */
export function ratingLabel(rating: number): string {
  return `${rating} out of ${MAX_RATING} stars`;
}

/** Mean rating rounded to one decimal, or null with no reviews. */
export function averageRating(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
}
