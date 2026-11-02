import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/guards";
import { getOwnShopOrder } from "@/server/data/wardrobe";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

/** US-A4: where the customer lands after paying (via /api/payments/callback). */
export default function CheckoutResultPage({ searchParams }: PageProps<"/checkout/success">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading your order…
          </p>
        }
      >
        <Result searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Result({ searchParams }: Pick<PageProps<"/checkout/success">, "searchParams">) {
  const user = await requireUser("/account/wardrobe");
  const params = await searchParams;
  const orderId = typeof params.order === "string" ? params.order : "";
  const order = orderId ? await getOwnShopOrder(prisma, user.id, orderId) : null;
  if (!order) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that order</h1>
        <Button asChild variant="outline">
          <Link href="/account/wardrobe">Go to My Wardrobe</Link>
        </Button>
      </div>
    );
  }

  if (order.status === "PAID" || order.status === "FULFILLED") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">Payment received</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Thank you! {order.product.name} is yours.
        </h1>
        <dl className="flex flex-col gap-1 rounded-md border p-4 text-sm">
          <div className="flex justify-between">
            <dt>Paid</dt>
            <dd className="tabular-nums" data-testid="order-paid-total">
              {formatNGN(order.totalKobo)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{order.fulfillmentMethod === "PICKUP" ? "Pickup" : "Delivery"}</dt>
            <dd className="text-right">
              {order.fulfillmentMethod === "PICKUP"
                ? (env.STUDIO_ADDRESS ?? "We'll email you the studio address and a pickup time.")
                : `${order.address?.recipientName}, ${order.address?.line1}, ${order.address?.city}, ${order.address?.state}` +
                  (order.deliveryZone ? ` · usually ${order.deliveryZone.etaDays} days` : "")}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">We&apos;ve emailed you a confirmation.</p>
        <Button asChild>
          <Link href="/account/wardrobe">See My Wardrobe</Link>
        </Button>
      </div>
    );
  }

  const pending = order.status === "PENDING_PAYMENT";
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {pending ? "We're confirming your payment" : "Payment not completed"}
      </h1>
      <p className="text-muted-foreground">
        {pending
          ? "This can take a minute. Refresh this page shortly. You won't be charged twice."
          : "No payment was taken. The piece may still be available."}
      </p>
      <div className="flex flex-wrap gap-3">
        {pending ? (
          <Button asChild>
            <Link href={`/checkout/success?order=${order.id}`}>Refresh</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={`/shop/${order.product.slug}`}>Back to {order.product.name}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
