import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PipelineBoard } from "@/components/admin/pipeline-board";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/custom-order/status";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { FulfilButton } from "@/components/admin/fulfil-button";
import { isReservationActive } from "@/lib/checkout";
import { formatNGN } from "@/lib/money";
import { formatNigerianPhone } from "@/lib/nigeria";
import { updateCustomOrderStatus } from "@/server/actions/admin/orders";
import { markOrderFulfilledAction } from "@/server/actions/admin/shop-orders";
import { listShopOrders } from "@/server/data/wardrobe";
import { requireAdmin } from "@/server/auth/guards";
import { PIPELINE_STATUSES, listClosedOrders, listPipelineCards } from "@/server/data/admin/orders";

export const metadata: Metadata = { title: "Custom orders" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** US-C1 AC1: Kanban of active orders; completed/cancelled in a filterable list. */
export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Custom orders</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading orders…
          </p>
        }
      >
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Orders({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const view = params.view === "closed" ? "closed" : params.view === "shop" ? "shop" : "board";
  const statusParam = Array.isArray(params.status) ? params.status[0] : params.status;
  const closedStatus =
    statusParam === "COMPLETED" || statusParam === "CANCELLED" ? statusParam : undefined;

  const tabs = [
    { href: "/admin/orders", label: "Pipeline", active: view === "board" },
    { href: "/admin/orders?view=shop", label: "Shop orders", active: view === "shop" },
    {
      href: "/admin/orders?view=closed",
      label: "Completed & cancelled",
      active: view === "closed",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Order views">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm",
                  t.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {view === "board" ? (
        <Board />
      ) : view === "shop" ? (
        <ShopOrders />
      ) : (
        <Closed status={closedStatus} />
      )}
    </div>
  );
}

async function Board() {
  const cards = await listPipelineCards(prisma);
  return (
    <PipelineBoard cards={cards} columns={PIPELINE_STATUSES} action={updateCustomOrderStatus} />
  );
}

async function Closed({ status }: { status?: "COMPLETED" | "CANCELLED" }) {
  const orders = await listClosedOrders(prisma, status);
  const filters = [
    { value: undefined, label: "All" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter closed orders">
        <ul className="flex gap-2 text-sm">
          {filters.map((f) => (
            <li key={f.label}>
              <Link
                href={
                  f.value
                    ? `/admin/orders?view=closed&status=${f.value}`
                    : "/admin/orders?view=closed"
                }
                aria-current={status === f.value ? "page" : undefined}
                className={cn(
                  "underline-offset-4",
                  status === f.value ? "font-medium underline" : "hover:underline",
                )}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders here yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Reference
                </th>
                <th scope="col" className="p-3 font-medium">
                  Title
                </th>
                <th scope="col" className="p-3 font-medium">
                  Customer
                </th>
                <th scope="col" className="p-3 font-medium">
                  Status
                </th>
                <th scope="col" className="p-3 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="p-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="p-3">{o.title}</td>
                  <td className="p-3">{o.customerName ?? o.customerEmail}</td>
                  <td className="p-3">
                    <Badge variant={o.status === "CANCELLED" ? "outline" : "secondary"}>
                      {STATUS_LABELS[o.status]}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{dateFormat.format(o.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SHOP_STATUS = {
  PENDING_PAYMENT: "In checkout",
  PAID: "Paid: to fulfil",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const;

/** US-A4 AC8: ready-to-wear orders; paid ones can be marked picked up / delivered. */
async function ShopOrders() {
  const now = new Date();
  const orders = (await listShopOrders(prisma)).filter(
    (o) => o.status !== "PENDING_PAYMENT" || isReservationActive(o.createdAt, now),
  );
  if (orders.length === 0)
    return <p className="text-sm text-muted-foreground">No shop orders yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => (
        <li
          key={o.id}
          aria-label={`Shop order: ${o.product.name}`}
          className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4 text-sm"
        >
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {o.product.name} · {formatNGN(o.totalKobo)}
            </p>
            <p className="text-muted-foreground">
              <Link href={`/admin/clients/${o.user.id}`} className="underline">
                {o.user.name ?? o.user.email}
              </Link>
              {o.user.phone ? ` · ${formatNigerianPhone(o.user.phone)}` : ""} ·{" "}
              {dateFormat.format(o.createdAt)}
            </p>
            <p>
              {o.fulfillmentMethod === "PICKUP"
                ? "Pickup at the studio"
                : o.address
                  ? `Deliver to ${o.address.recipientName}, ${o.address.line1}${o.address.line2 ? `, ${o.address.line2}` : ""}, ${o.address.city}, ${o.address.state}${o.address.landmark ? ` (near ${o.address.landmark})` : ""} · ${formatNigerianPhone(o.address.phone)}`
                  : "Delivery"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={o.status === "PAID" ? "default" : "secondary"}>
              {SHOP_STATUS[o.status]}
            </Badge>
            {o.fulfilledAt ? (
              <span className="text-xs text-muted-foreground">
                on {dateFormat.format(o.fulfilledAt)}
              </span>
            ) : null}
            {o.status === "PAID" ? (
              <FulfilButton
                orderId={o.id}
                label={o.fulfillmentMethod === "PICKUP" ? "Mark as picked up" : "Mark as delivered"}
                action={markOrderFulfilledAction}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
