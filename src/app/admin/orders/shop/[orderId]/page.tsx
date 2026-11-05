import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CourierPanel } from "@/components/admin/courier-panel";
import { Badge } from "@/components/ui/badge";
import { formatNGN } from "@/lib/money";
import { formatNigerianPhone } from "@/lib/nigeria";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Shop order" };

const STATUS = {
  PENDING_PAYMENT: "In checkout",
  PAID: "Paid: to fulfil",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const;

/** US-D5: a ready-to-wear order's delivery: courier booking and tracking. */
export default function ShopOrderPage({ params }: PageProps<"/admin/orders/shop/[orderId]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/admin/orders?view=shop" className="text-sm underline">
        ← Shop orders
      </Link>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading order…
          </p>
        }
      >
        <ShopOrder params={params} />
      </Suspense>
    </main>
  );
}

async function ShopOrder({ params }: Pick<PageProps<"/admin/orders/shop/[orderId]">, "params">) {
  await requireAdmin();
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalKobo: true,
      deliveryFeeKobo: true,
      deliveryQuotedBy: true,
      fulfillmentMethod: true,
      product: { select: { name: true } },
      user: { select: { id: true, name: true, email: true } },
      deliveryZone: { select: { name: true } },
      address: {
        select: {
          recipientName: true,
          phone: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          landmark: true,
        },
      },
    },
  });
  if (!order) notFound();
  const a = order.address;

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{order.product.name}</h1>
          <Badge data-testid="order-status">{STATUS[order.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/admin/clients/${order.user.id}`} className="underline">
            {order.user.name ?? order.user.email}
          </Link>{" "}
          · {formatNGN(order.totalKobo)} paid
        </p>
      </header>

      <section aria-labelledby="delivery-heading" className="flex flex-col gap-2 text-sm">
        <h2 id="delivery-heading" className="text-lg font-semibold">
          Delivery
        </h2>
        {order.fulfillmentMethod === "PICKUP" || !a ? (
          <p>Pickup at the studio.</p>
        ) : (
          <>
            <p>
              {a.recipientName}, {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state}
              {a.landmark ? ` (near ${a.landmark})` : ""} · {formatNigerianPhone(a.phone)}
            </p>
            <p className="text-muted-foreground">
              Customer paid {formatNGN(order.deliveryFeeKobo)} for delivery
              {order.deliveryQuotedBy
                ? ` (${order.deliveryQuotedBy} live price)`
                : order.deliveryZone
                  ? ` (${order.deliveryZone.name} zone fee)`
                  : ""}
              .
            </p>
          </>
        )}
      </section>

      {order.fulfillmentMethod === "DELIVERY" ? (
        <section aria-labelledby="courier-heading" className="flex flex-col gap-3">
          <h2 id="courier-heading" className="text-lg font-semibold">
            Courier
          </h2>
          <Suspense
            fallback={
              <p role="status" className="text-sm text-muted-foreground">
                Getting courier prices…
              </p>
            }
          >
            <CourierPanel
              target={{ kind: "ORDER", id: order.id }}
              chargedKobo={order.deliveryFeeKobo}
            />
          </Suspense>
        </section>
      ) : null}
    </>
  );
}
