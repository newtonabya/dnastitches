import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { OrderProgress } from "@/components/account/order-progress";
import { RepairStatusItem } from "@/components/account/repair-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REPAIR_STATUSES, isWithinDefectWindow } from "@/lib/repairs";
import { REVIEW_STATE_LABELS, reviewState } from "@/lib/reviews";
import { requireUser } from "@/server/auth/guards";
import { listUserRepairs } from "@/server/data/repairs";
import { listUserReviewStates } from "@/server/data/reviews";
import { listWardrobe } from "@/server/data/wardrobe";

export const metadata: Metadata = { title: "My Wardrobe" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});
const RTW_STATUS = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  FULFILLED: "Collected / delivered",
  CANCELLED: "Cancelled",
} as const;

/** US-D1 AC1: custom orders (active first), ready-to-wear purchases and repairs (US-D3). */
export default function WardrobePage({ searchParams }: PageProps<"/account/wardrobe">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">My Wardrobe</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading your orders…
          </p>
        }
      >
        <Wardrobe searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Wardrobe({ searchParams }: Pick<PageProps<"/account/wardrobe">, "searchParams">) {
  const user = await requireUser("/account/wardrobe");
  const [{ customOrders, orders }, repairs, reviews, params] = await Promise.all([
    listWardrobe(prisma, user.id),
    listUserRepairs(prisma, user.id),
    listUserReviewStates(prisma, user.id),
    searchParams,
  ]);
  const reviewByProduct = new Map(reviews.flatMap((r) => (r.productId ? [[r.productId, r]] : [])));
  const now = new Date();
  const activeRepairFor = new Set(
    repairs
      .filter((r) => (ACTIVE_REPAIR_STATUSES as readonly string[]).includes(r.status))
      .flatMap((r) => [r.orderId, r.customOrderId])
      .filter(Boolean),
  );

  return (
    <>
      {params.review === "sent" ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          Thank you for your review! It will appear on the site once we&apos;ve checked it.
        </p>
      ) : null}
      {params.repair === "reported" ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          Thanks, we&apos;ve received your report and emailed you a copy. We&apos;ll be in touch
          about getting the piece to us.
        </p>
      ) : null}
      <section aria-labelledby="custom-heading" className="flex flex-col gap-4">
        <h2 id="custom-heading" className="text-xl font-semibold">
          Custom pieces
        </h2>
        {customOrders.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-sm">No custom pieces yet.</p>
            <Button asChild variant="outline">
              <Link href="/custom/request">Start a custom request</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {customOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/account/wardrobe/${o.id}`}
                  className="flex flex-col gap-3 rounded-lg border p-4 outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{o.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.reference} · {dateFormat.format(o.createdAt)}
                    </span>
                  </div>
                  <OrderProgress status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rtw-heading" className="flex flex-col gap-4">
        <h2 id="rtw-heading" className="text-xl font-semibold">
          Ready-to-wear purchases
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No purchases yet.{" "}
            <Link href="/shop" className="underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
              >
                <span>
                  <Link href={`/shop/${o.product.slug}`} className="font-medium hover:underline">
                    {o.product.name}
                  </Link>
                  <span className="text-muted-foreground"> · {dateFormat.format(o.createdAt)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <Badge variant={o.status === "FULFILLED" ? "secondary" : "outline"}>
                    {RTW_STATUS[o.status]}
                  </Badge>
                  <span className="tabular-nums">{formatNGN(o.totalKobo)}</span>
                  {o.status === "FULFILLED" &&
                  !activeRepairFor.has(o.id) &&
                  isWithinDefectWindow(o.fulfilledAt, now, env.REPAIR_WINDOW_DAYS) ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/account/wardrobe/repair?order=${o.id}`}
                        aria-label={`Report a defect: ${o.product.name}`}
                      >
                        Report a defect
                      </Link>
                    </Button>
                  ) : null}
                  {o.status === "FULFILLED" ? (
                    reviewByProduct.has(o.product.id) ? (
                      <span className="text-xs text-muted-foreground">
                        Review:{" "}
                        {REVIEW_STATE_LABELS[
                          reviewState(reviewByProduct.get(o.product.id)!)
                        ].toLowerCase()}
                      </span>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/account/wardrobe/review?order=${o.id}`}
                          aria-label={`Leave a review: ${o.product.name}`}
                        >
                          Leave a review
                        </Link>
                      </Button>
                    )
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {repairs.length > 0 ? (
        <section aria-labelledby="repairs" className="flex flex-col gap-4">
          <h2 id="repairs" className="scroll-mt-20 text-xl font-semibold">
            Repairs
          </h2>
          <ul className="flex flex-col gap-3">
            {repairs.map((r) => (
              <li key={r.id}>
                <RepairStatusItem
                  item={
                    r.order?.product.name ??
                    (r.customOrder
                      ? `${r.customOrder.title} (${r.customOrder.reference})`
                      : "Piece")
                  }
                  status={r.status}
                  description={r.description}
                  rejectionReason={r.rejectionReason}
                  createdAt={r.createdAt}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
