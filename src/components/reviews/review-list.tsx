import { averageRating } from "@/lib/reviews";
import type { PublicReview } from "@/server/data/reviews";

import { Stars } from "./stars";

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** US-H1 AC3: approved reviews on a product page. Renders nothing without reviews. */
export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) return null;
  const average = averageRating(reviews.map((r) => r.rating))!;
  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="reviews-heading" className="text-lg font-semibold">
          Reviews
        </h2>
        <span className="text-sm text-muted-foreground">
          {average.toFixed(1)} out of 5 · {reviews.length}{" "}
          {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {reviews.map((r) => (
          <li key={r.id}>
            <figure className="flex flex-col gap-1 text-sm">
              <Stars rating={r.rating} />
              <blockquote className="whitespace-pre-line">{r.body}</blockquote>
              <figcaption className="text-muted-foreground">
                {r.displayName} · {dateFormat.format(r.createdAt)}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
