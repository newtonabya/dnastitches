import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ScheduleAppointmentForm } from "@/components/admin/appointment-forms";
import {
  AdminNotesForm,
  OfflinePaymentForm,
  QuoteForm,
  StatusControl,
} from "@/components/admin/order-forms";
import { Badge } from "@/components/ui/badge";
import { defaultOfflinePaymentKind } from "@/lib/custom-order/balance";
import { STATUS_LABELS } from "@/lib/custom-order/status";
import { resolveDeliveryFee } from "@/lib/delivery";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { formatNigerianPhone } from "@/lib/nigeria";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS } from "@/lib/scheduling/appointments";
import { MEASUREMENT_FIELDS } from "@/lib/validators/measurements";
import {
  recordOfflinePaymentAction,
  sendQuoteAction,
  updateAdminNotesAction,
  updateCustomOrderStatus,
} from "@/server/actions/admin/orders";
import { scheduleAppointmentAction } from "@/server/actions/admin/appointments";
import { requireAdmin } from "@/server/auth/guards";
import { getAdminOrderDetail } from "@/server/data/admin/orders";
import { listOrderAppointments } from "@/server/data/appointments";

export const metadata: Metadata = { title: "Custom order" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});
const dateOnly = new Intl.DateTimeFormat("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" });

/** US-C1 AC5 + admin side of US-C4: everything about one custom order. */
export default function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/orders" className="hover:underline">
          ← Pipeline
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading order…
          </p>
        }
      >
        <OrderDetail params={params} />
      </Suspense>
    </main>
  );
}

async function OrderDetail({ params }: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  const [order, appointments] = await Promise.all([
    getAdminOrderDetail(prisma, id),
    listOrderAppointments(prisma, id),
  ]);
  if (!order) notFound();
  const timeZone = env.STUDIO_TIMEZONE;
  const apptTime = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  let suggestedDeliveryFeeKobo = 0;
  if (order.fulfillmentMethod === "DELIVERY" && order.address) {
    const zones = await prisma.deliveryZone.findMany({ where: { isActive: true } });
    const fee = resolveDeliveryFee(order.address.state, zones);
    if (fee.available) suggestedDeliveryFeeKobo = fee.feeKobo;
  }

  const unit = order.measurementProfile?.unit === "IN" ? "in" : "cm";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{order.reference}</h1>
            <Badge data-testid="order-status">{STATUS_LABELS[order.status]}</Badge>
          </div>
          <p className="text-lg">{order.title}</p>
          <p className="text-sm text-muted-foreground">
            <Link href={`/admin/clients/${order.user.id}`} className="underline">
              {order.user.name ?? order.user.email}
            </Link>{" "}
            · {order.user.email}
            {order.user.phone ? ` · ${formatNigerianPhone(order.user.phone)}` : ""} · submitted{" "}
            {dateTime.format(order.createdAt)}
          </p>
        </header>

        <Section title="Request">
          <p className="whitespace-pre-line">{order.description}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label="Occasion">{order.occasion ?? "—"}</Item>
            <Item label="Target date">
              {order.targetDate ? dateOnly.format(order.targetDate) : "—"}
            </Item>
            <Item label="Budget">
              {order.budgetKobo !== null ? formatNGN(order.budgetKobo) : "—"}
            </Item>
            <Item label="Source">
              {order.sourceProduct ? (
                <Link href={`/shop/${order.sourceProduct.slug}`} className="underline">
                  Sold-out piece: {order.sourceProduct.name}
                </Link>
              ) : order.portfolioItem ? (
                <>Portfolio: {order.portfolioItem.title}</>
              ) : (
                "Direct request"
              )}
            </Item>
            <Item label="Fabric">
              {order.fabricSwatch ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3 rounded-full border"
                    style={{ backgroundColor: order.fabricSwatch.colorHex }}
                  />
                  {order.fabricSwatch.name}
                </span>
              ) : (
                "Not sure — advise"
              )}
            </Item>
            <Item label="Fulfilment">
              {order.fulfillmentMethod === "DELIVERY" && order.address
                ? `Delivery to ${order.address.recipientName}, ${order.address.line1}, ${order.address.city}, ${order.address.state}`
                : order.fulfillmentMethod === "DELIVERY"
                  ? "Delivery (no address)"
                  : "Pickup"}
            </Item>
          </dl>
          {order.referenceImageUrls.length > 0 ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5" aria-label="Reference images">
              {order.referenceImageUrls.map((url, i) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block aspect-square overflow-hidden rounded-md bg-muted"
                  >
                    <Image
                      src={url}
                      alt={`Reference image ${i + 1}`}
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section title="Measurements">
          {order.measurementProfile ? (
            <>
              <p className="text-sm text-muted-foreground">
                {order.measurementProfile.label} · taken by{" "}
                {order.measurementProfile.takenBy === "ADMIN" ? "atelier" : "customer"} ·{" "}
                {dateOnly.format(order.measurementProfile.createdAt)}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {MEASUREMENT_FIELDS.map((f) => {
                  const v = order.measurementProfile![f.key];
                  return v === null ? null : (
                    <Item key={f.key} label={f.label}>
                      {v.toString()} {unit}
                    </Item>
                  );
                })}
              </dl>
            </>
          ) : (
            <p className="text-sm">
              No measurements linked. Check the private notes (the customer may want an
              appointment).
            </p>
          )}
        </Section>

        <Section title="Quote & payments">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Item label="Quote">
              {order.quotedPriceKobo !== null ? formatNGN(order.quotedPriceKobo) : "Not sent"}
            </Item>
            <Item label="Delivery fee">{formatNGN(order.deliveryFeeKobo ?? 0)}</Item>
            <Item label="Paid">{formatNGN(order.balance.paidKobo)}</Item>
            <Item label="Balance due">
              <span data-testid="balance-due">{formatNGN(order.balance.balanceDueKobo)}</span>
            </Item>
          </dl>
          {order.payments.length > 0 ? (
            <ul className="divide-y rounded-md border text-sm">
              {order.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 p-3">
                  <span>
                    {p.kind === "CUSTOM_DEPOSIT" ? "Deposit" : "Balance"} ·{" "}
                    {p.channel === "OFFLINE" ? "Offline" : "Paystack"} · {p.status.toLowerCase()}
                    {p.recordedBy
                      ? ` · recorded by ${p.recordedBy.name ?? p.recordedBy.email}`
                      : ""}
                  </span>
                  <span className="tabular-nums">
                    {formatNGN(p.amountKobo)} {p.paidAt ? `· ${dateTime.format(p.paidAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {["CONSULTATION_PENDING", "MEASUREMENTS_TAKEN", "AWAITING_DEPOSIT"].includes(
            order.status,
          ) ? (
            <div className="rounded-md border p-4">
              <h3 className="mb-3 font-medium">
                {order.quotedPriceKobo === null ? "Send quote" : "Revise quote"}
              </h3>
              <QuoteForm
                orderId={order.id}
                quotedPriceKobo={order.quotedPriceKobo}
                depositKobo={order.depositKobo}
                deliveryFeeKobo={order.deliveryFeeKobo}
                suggestedDeliveryFeeKobo={suggestedDeliveryFeeKobo}
                depositPercent={env.DEPOSIT_PERCENT}
                action={sendQuoteAction}
              />
              {order.status !== "MEASUREMENTS_TAKEN" && order.status !== "AWAITING_DEPOSIT" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  The order moves to Awaiting deposit when it&apos;s in Measurements taken and you
                  send the quote.
                </p>
              ) : null}
            </div>
          ) : null}
          {order.quotedPriceKobo !== null && order.status !== "CANCELLED" ? (
            <div className="rounded-md border p-4">
              <h3 className="mb-3 font-medium">Record offline payment</h3>
              <OfflinePaymentForm
                orderId={order.id}
                defaultKind={
                  defaultOfflinePaymentKind(order.status) === "CUSTOM_DEPOSIT"
                    ? "CUSTOM_DEPOSIT"
                    : "CUSTOM_BALANCE"
                }
                action={recordOfflinePaymentAction}
              />
            </div>
          ) : null}
        </Section>
      </div>

      <aside className="flex flex-col gap-8">
        <Section title="Status">
          <StatusControl
            orderId={order.id}
            status={order.status}
            depositPaid={order.balance.hasSuccessfulDeposit}
            action={updateCustomOrderStatus}
          />
        </Section>

        <Section title="Appointments">
          {appointments.length > 0 ? (
            <ul className="flex flex-col gap-2 text-sm">
              {appointments.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/appointments/${a.id}`} className="underline">
                    {APPOINTMENT_TYPE_LABELS[a.type]} · {apptTime.format(a.startsAt)}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {APPOINTMENT_STATUS_LABELS[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No appointments yet.</p>
          )}
          {order.status !== "COMPLETED" && order.status !== "CANCELLED" ? (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Book an appointment</summary>
              <div className="mt-3">
                <ScheduleAppointmentForm
                  customOrderId={order.id}
                  timeZoneLabel={`${timeZone.split("/").pop()!.replace(/_/g, " ")} time`}
                  defaultMinutes={env.CONSULTATION_MINUTES}
                  action={scheduleAppointmentAction}
                />
              </div>
            </details>
          ) : null}
        </Section>

        <Section title="Timeline">
          <ol className="flex flex-col gap-3 border-l pl-4 text-sm" aria-label="Status history">
            {order.statusLogs.map((log) => (
              <li key={log.id} className="flex flex-col">
                <span className="font-medium">{STATUS_LABELS[log.toStatus]}</span>
                <span className="text-xs text-muted-foreground">
                  {dateTime.format(log.createdAt)} ·{" "}
                  {log.changedBy ? (log.changedBy.name ?? log.changedBy.email) : "System"}
                </span>
                {log.note ? <span className="text-muted-foreground">{log.note}</span> : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Private notes">
          <p className="text-xs text-muted-foreground">Only admins see these.</p>
          <AdminNotesForm
            orderId={order.id}
            adminNotes={order.adminNotes}
            action={updateAdminNotesAction}
          />
        </Section>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
