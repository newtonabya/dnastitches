import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { OrderProgress } from "@/components/account/order-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/guards";
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

/** US-D1 AC1: custom orders (active first) and ready-to-wear purchases. */
export default function WardrobePage() {
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
        <Wardrobe />
      </Suspense>
    </main>
  );
}

async function Wardrobe() {
  const user = await requireUser("/account/wardrobe");
  const { customOrders, orders } = await listWardrobe(prisma, user.id);

  return (
    <>
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
                <span className="flex items-center gap-3">
                  <Badge variant={o.status === "FULFILLED" ? "secondary" : "outline"}>
                    {RTW_STATUS[o.status]}
                  </Badge>
                  <span className="tabular-nums">{formatNGN(o.totalKobo)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
