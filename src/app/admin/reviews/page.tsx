import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ReviewModeration } from "@/components/admin/review-moderation";
import { Stars } from "@/components/reviews/stars";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { REVIEW_STATE_LABELS, reviewState } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import { moderateReviewAction } from "@/server/actions/admin/reviews";
import { requireAdmin } from "@/server/auth/guards";
import { type AdminReviewFilter, type AdminReview, listAdminReviews } from "@/server/data/reviews";

export const metadata: Metadata = { title: "Reviews" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

const FILTERS: { value: AdminReviewFilter; label: string }[] = [
  { value: "pending", label: "To approve" },
  { value: "approved", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

/** US-H1 AC2: reviews stay hidden until approved here. */
export default function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Approved reviews appear on the product page and, at 4–5 stars, as testimonials on the home
          page. Only the name the customer chose is shown.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading reviews…
          </p>
        }
      >
        <Reviews searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Reviews({ searchParams }: Pick<PageProps<"/admin/reviews">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.value === params.show)?.value ?? "pending";
  const banner =
    params.moderated === "approved"
      ? "Review approved. It's now public."
      : params.moderated === "hidden"
        ? "Review hidden from the site."
        : null;
  const reviews = await listAdminReviews(prisma, filter);
  return (
    <div className="flex flex-col gap-4">
      {banner ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {banner}
        </p>
      ) : null}
      <nav aria-label="Filter reviews">
        <ul className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <Link
                href={f.value === "pending" ? "/admin/reviews" : `/admin/reviews?show=${f.value}`}
                aria-current={filter === f.value ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3",
                  filter === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filter === "pending" ? "Nothing waiting for approval." : "No reviews here."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewCard review={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: AdminReview }) {
  const state = reviewState(r);
  const item =
    r.product?.name ??
    (r.customOrder ? `${r.customOrder.title} (${r.customOrder.reference})` : "A piece");
  return (
    <article
      aria-label={`Review of ${item} by ${r.displayName}`}
      className="flex flex-col gap-3 rounded-lg border p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stars rating={r.rating} />
        <Badge
          data-testid="review-state"
          variant={state === "APPROVED" ? "default" : state === "PENDING" ? "secondary" : "outline"}
        >
          {REVIEW_STATE_LABELS[state]}
        </Badge>
      </div>
      <p className="whitespace-pre-line">{r.body}</p>
      <p className="text-muted-foreground">
        Shown as <span className="font-medium text-foreground">{r.displayName}</span> ·{" "}
        <Link href={`/admin/clients/${r.user.id}`} className="underline">
          {r.user.name ?? r.user.email}
        </Link>{" "}
        · {dateFormat.format(r.createdAt)} ·{" "}
        {r.product ? (
          <Link href={`/shop/${r.product.slug}`} className="underline">
            {item}
          </Link>
        ) : r.customOrder ? (
          <Link href={`/admin/orders/${r.customOrder.id}`} className="underline">
            {item}
          </Link>
        ) : (
          item
        )}
      </p>
      <ReviewModeration
        reviewId={r.id}
        state={state}
        label={`review by ${r.displayName}`}
        action={moderateReviewAction}
      />
    </article>
  );
}
