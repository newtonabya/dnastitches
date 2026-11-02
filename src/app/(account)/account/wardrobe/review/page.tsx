import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReviewForm } from "@/components/reviews/review-form";
import { Stars } from "@/components/reviews/stars";
import { prisma } from "@/lib/prisma";
import { REVIEW_STATE_LABELS, defaultDisplayName, reviewState } from "@/lib/reviews";
import { createReviewAction } from "@/server/actions/reviews";
import { requireUser } from "@/server/auth/guards";
import { getReviewTarget } from "@/server/data/reviews";

export const metadata: Metadata = { title: "Leave a review" };

/** US-H1 AC1: review a fulfilled shop order or completed custom order (once). */
export default function ReviewPage({ searchParams }: PageProps<"/account/wardrobe/review">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/account/wardrobe" className="hover:underline">
          ← My Wardrobe
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        }
      >
        <Review searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Review({
  searchParams,
}: Pick<PageProps<"/account/wardrobe/review">, "searchParams">) {
  const params = await searchParams;
  const order = typeof params.order === "string" ? params.order : null;
  const customOrder = typeof params.customOrder === "string" ? params.customOrder : null;
  const query = order ? `order=${order}` : customOrder ? `customOrder=${customOrder}` : "";
  const user = await requireUser(`/account/wardrobe/review?${query}`);
  const targetId = order ?? customOrder;
  // Scoped to the signed-in customer; ineligible or someone else's order is "not found".
  const target = targetId
    ? await getReviewTarget(prisma, user.id, order ? "ORDER" : "CUSTOM_ORDER", targetId)
    : null;
  if (!target) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Leave a review</h1>
        <p className="text-lg">
          {target.label}
          {target.reference ? (
            <span className="text-muted-foreground"> · {target.reference}</span>
          ) : null}
        </p>
      </header>
      {target.existing ? (
        <section
          aria-label="Your review"
          className="flex flex-col gap-2 rounded-lg border p-4 text-sm"
        >
          <p className="font-medium">
            Thanks for your review. {REVIEW_STATE_LABELS[reviewState(target.existing)]}.
          </p>
          <Stars rating={target.existing.rating} />
          <p className="whitespace-pre-line">{target.existing.body}</p>
          <p className="text-muted-foreground">— {target.existing.displayName}</p>
        </section>
      ) : (
        <ReviewForm
          kind={target.kind}
          targetId={target.id}
          defaultName={defaultDisplayName(user.name)}
          action={createReviewAction}
        />
      )}
    </div>
  );
}
