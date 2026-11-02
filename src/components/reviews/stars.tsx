import { MAX_RATING, ratingLabel } from "@/lib/reviews";
import { cn } from "@/lib/utils";

/** A read-only star rating, announced as "4 out of 5 stars". */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={ratingLabel(rating)}
      className={cn("tracking-wider text-brand", className)}
    >
      <span aria-hidden>
        {"★".repeat(rating)}
        <span className="text-muted-foreground">{"☆".repeat(MAX_RATING - rating)}</span>
      </span>
    </span>
  );
}
