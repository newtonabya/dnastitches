import { averageRating, defaultDisplayName, ratingLabel, reviewState } from "@/lib/reviews";
import { moderateReviewSchema, reviewSchema } from "@/lib/validators/reviews";

describe("review helpers (US-H1)", () => {
  it("derives pending, approved and hidden states", () => {
    expect(reviewState({ isApproved: false, moderatedAt: null })).toBe("PENDING");
    expect(reviewState({ isApproved: true, moderatedAt: new Date() })).toBe("APPROVED");
    expect(reviewState({ isApproved: false, moderatedAt: new Date() })).toBe("HIDDEN");
  });

  it("suggests a first name and last initial", () => {
    expect(defaultDisplayName("Ada Okafor")).toBe("Ada O.");
    expect(defaultDisplayName("  ada   ngozi  okafor ")).toBe("ada O.");
    expect(defaultDisplayName("Chioma")).toBe("Chioma");
    expect(defaultDisplayName("")).toBe("");
    expect(defaultDisplayName(null)).toBe("");
  });

  it("labels and averages ratings", () => {
    expect(ratingLabel(4)).toBe("4 out of 5 stars");
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([])).toBeNull();
  });
});

describe("review validators", () => {
  const ok = {
    kind: "ORDER",
    targetId: "o1",
    rating: "5",
    body: "Beautiful finish, fits perfectly.",
    displayName: "Ada O.",
  };

  it("accepts a complete review", () => {
    expect(reviewSchema.parse(ok)).toEqual({ ...ok, rating: 5 });
  });

  it("requires a rating 1–5, enough text and a display name", () => {
    const messages = (v: unknown) => reviewSchema.safeParse(v).error?.issues.map((i) => i.message);
    expect(messages({ ...ok, rating: "" })).toEqual(["Choose a rating"]);
    expect(messages({ ...ok, rating: "6" })).toEqual(["Choose a rating"]);
    expect(messages({ ...ok, rating: "2.5" })).toEqual(["Choose a rating"]);
    expect(messages({ ...ok, body: "Nice" })).toEqual(["Please write at least 10 characters"]);
    expect(messages({ ...ok, displayName: "  " })).toEqual([
      "Add the name to show with your review",
    ]);
    expect(messages({ ...ok, kind: "PAYMENT" })).toEqual(["Unknown order type"]);
  });

  it("parses moderation decisions", () => {
    expect(moderateReviewSchema.parse({ reviewId: "r", decision: "HIDE" })).toEqual({
      reviewId: "r",
      decision: "HIDE",
    });
    expect(moderateReviewSchema.safeParse({ reviewId: "r", decision: "DELETE" }).success).toBe(
      false,
    );
  });
});
