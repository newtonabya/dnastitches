import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OrderProgress } from "@/components/account/order-progress";
import { PayForm } from "@/components/account/pay-form";
import { RepairStatusItem } from "@/components/account/repair-status";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/custom-order/status";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REPAIR_STATUSES, isWithinDefectWindow } from "@/lib/repairs";
import { startCustomPaymentAction } from "@/server/actions/checkout";
import { requireUser } from "@/server/auth/guards";
import { getWardrobeOrder } from "@/server/data/wardrobe";

export const metadata: Metadata = { title: "Order progress" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

const PAYMENT_BANNERS = {
  success: "Payment received. Thank you!",
  pending: "We're confirming your payment. This can take a minute; refresh shortly.",
  failed: "The payment wasn't completed and you weren't charged. You can try again below.",
} as const;

/** US-D1 + US-C4: progress, customer-friendly timeline, quote, payments and balance. */
export default function WardrobeOrderPage({
  params,
  searchParams,
}: PageProps<"/account/wardrobe/[orderId]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/account/wardrobe" className="hover:underline">
          ← My Wardrobe
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading your order…
          </p>
        }
      >
        <Order params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Order({
  params,
  searchParams,
}: Pick<PageProps<"/account/wardrobe/[orderId]">, "params" | "searchParams">) {
  const { orderId } = await params;
  const user = await requireUser(`/account/wardrobe/${orderId}`);
  // Scoped to the signed-in customer: someone else's order is simply "not found" (AC4).
  const order = await getWardrobeOrder(prisma, user.id, orderId);
  if (!order) notFound();
  const paymentState = (await searchParams).payment;
  const banner =
    typeof paymentState === "string" && paymentState in PAYMENT_BANNERS
      ? PAYMENT_BANNERS[paymentState as keyof typeof PAYMENT_BANNERS]
      : null;

  const { balance } = order;
  const depositDue =
    order.status === "AWAITING_DEPOSIT" &&
    !balance.hasSuccessfulDeposit &&
    (order.depositKobo ?? 0) > 0;
  const balanceDue = order.status === "READY" && balance.balanceDueKobo > 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{order.reference}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{order.title}</h1>
      </header>

      {banner ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {banner}
        </p>
      ) : null}

      <OrderProgress status={order.status} />

      {order.quotedPriceKobo !== null ? (
        <section
          aria-labelledby="money-heading"
          className="flex flex-col gap-4 rounded-lg border p-4"
        >
          <h2 id="money-heading" className="text-lg font-semibold">
            Quote &amp; payments
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Quote</dt>
              <dd className="tabular-nums">{formatNGN(order.quotedPriceKobo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Delivery</dt>
              <dd className="tabular-nums">{formatNGN(order.deliveryFeeKobo ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Paid</dt>
              <dd className="tabular-nums">{formatNGN(balance.paidKobo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Balance due</dt>
              <dd className="tabular-nums" data-testid="customer-balance-due">
                {formatNGN(Math.max(0, balance.balanceDueKobo))}
              </dd>
            </div>
          </dl>
          {order.depositKobo !== null && !balance.hasSuccessfulDeposit ? (
            <p className="text-sm">
              Deposit to start production:{" "}
              <strong className="tabular-nums">{formatNGN(order.depositKobo)}</strong>
            </p>
          ) : null}
          {depositDue ? (
            <PayForm
              orderId={order.id}
              kind="CUSTOM_DEPOSIT"
              amountKobo={order.depositKobo ?? 0}
              action={startCustomPaymentAction}
            />
          ) : null}
          {balanceDue ? (
            <PayForm
              orderId={order.id}
              kind="CUSTOM_BALANCE"
              amountKobo={balance.balanceDueKobo}
              action={startCustomPaymentAction}
            />
          ) : null}
          {order.payments.length > 0 ? (
            <ul className="divide-y rounded-md border text-sm">
              {order.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 p-2">
                  <span>
                    {p.kind === "CUSTOM_DEPOSIT" ? "Deposit" : "Balance"}{" "}
                    {p.paidAt ? `· ${dateFormat.format(p.paidAt)}` : ""}
                  </span>
                  <span className="tabular-nums">{formatNGN(p.amountKobo)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : order.status !== "CANCELLED" ? (
        <p className="text-sm text-muted-foreground">
          We&apos;ll send your quote after your consultation and measurements.
        </p>
      ) : null}

      {order.status === "COMPLETED" ? (
        <section aria-labelledby="repairs-heading" className="flex flex-col gap-3">
          <h2 id="repairs-heading" className="text-lg font-semibold">
            Repairs
          </h2>
          {order.repairRequests.map((r) => (
            <RepairStatusItem
              key={r.id}
              item={order.title}
              status={r.status}
              description={r.description}
              rejectionReason={r.rejectionReason}
              createdAt={r.createdAt}
            />
          ))}
          {!order.repairRequests.some((r) =>
            (ACTIVE_REPAIR_STATUSES as readonly string[]).includes(r.status),
          ) && isWithinDefectWindow(order.completedAt, new Date(), env.REPAIR_WINDOW_DAYS) ? (
            <div className="flex flex-col items-start gap-2 text-sm">
              <p className="text-muted-foreground">
                Found a manufacturing defect? Report it within {env.REPAIR_WINDOW_DAYS} days of
                handover and we&apos;ll repair it free of charge.
              </p>
              <Button asChild variant="outline">
                <Link href={`/account/wardrobe/repair?customOrder=${order.id}`}>
                  Report a defect
                </Link>
              </Button>
            </div>
          ) : order.repairRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The {env.REPAIR_WINDOW_DAYS}-day window for reporting defects has closed.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Timeline
        </h2>
        <ol className="flex flex-col gap-3 border-l pl-4 text-sm" aria-label="Order timeline">
          {order.statusLogs.map((log) => (
            <li key={log.id}>
              <span className="font-medium">{STATUS_LABELS[log.toStatus]}</span>
              <span className="text-muted-foreground"> · {dateFormat.format(log.createdAt)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="details-heading" className="flex flex-col gap-2 text-sm">
        <h2 id="details-heading" className="text-lg font-semibold">
          Your request
        </h2>
        <p className="whitespace-pre-line">{order.description}</p>
        <p className="text-muted-foreground">
          {[
            order.occasion,
            order.targetDate ? `Target ${dateFormat.format(order.targetDate)}` : null,
            order.fabricSwatch ? `Fabric: ${order.fabricSwatch.name}` : "Fabric: we'll advise",
            order.fulfillmentMethod === "DELIVERY" && order.address
              ? `Delivery to ${order.address.city}, ${order.address.state}`
              : "Pickup",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>
    </div>
  );
}
