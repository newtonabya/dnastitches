import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { RevenueChart } from "@/components/admin/revenue-chart";
import { ANALYTICS_RANGES, type AnalyticsRange, parseRange, percent } from "@/lib/analytics";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/guards";
import { getAnalytics } from "@/server/data/admin/analytics";

export const metadata: Metadata = { title: "Analytics" };

const TYPE_LABELS = {
  CONSULTATION: "Consultations",
  MEASUREMENT: "Measurements",
  FITTING: "Fittings",
  PICKUP: "Pickups",
} as const;

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

/** v1.2 US-C5: how the business is doing, over a chosen range. */
export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Money is what was actually received (deposits, balances and shop sales), on the day it was
          paid.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading analytics…
          </p>
        }
      >
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Report({ searchParams }: Pick<PageProps<"/admin/analytics">, "searchParams">) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const a = await getAnalytics(prisma, {
    now: new Date(),
    range,
    timeZone: env.STUDIO_TIMEZONE,
  });

  return (
    <>
      <nav aria-label="Date range">
        <ul className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(ANALYTICS_RANGES) as AnalyticsRange[]).map((r) => (
            <li key={r}>
              <Link
                href={r === "30d" ? "/admin/analytics" : `/admin/analytics?range=${r}`}
                aria-current={range === r ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3",
                  range === r
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {ANALYTICS_RANGES[r].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="revenue" title="Revenue">
        <Tiles>
          <Tile
            label="Total received"
            value={formatNGN(a.revenue.totalKobo)}
            testId="revenue-total"
          >
            {a.revenue.payments} {a.revenue.payments === 1 ? "payment" : "payments"}
          </Tile>
          <Tile label="Shop sales" value={formatNGN(a.revenue.shopKobo)} />
          <Tile label="Custom orders" value={formatNGN(a.revenue.customKobo)}>
            Deposits and balances
          </Tile>
          <Tile label="Online (Paystack)" value={formatNGN(a.revenue.onlineKobo)} />
          <Tile label="Cash or transfer" value={formatNGN(a.revenue.offlineKobo)}>
            Recorded by you
          </Tile>
        </Tiles>
      </Section>

      <Section id="trend" title="Last 12 months">
        <RevenueChart data={a.trend} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="shop" title="Shop">
          <Tiles>
            <Tile label="Pieces sold" value={String(a.shop.piecesSold)} />
            <Tile
              label="Average order"
              value={a.shop.averageOrderKobo === null ? "—" : formatNGN(a.shop.averageOrderKobo)}
            />
          </Tiles>
        </Section>

        <Section id="reviews" title="Reviews">
          <Tiles>
            <Tile label="Reviews received" value={String(a.reviews.count)} />
            <Tile
              label="Average rating"
              value={a.reviews.averageRating === null ? "—" : `${a.reviews.averageRating} / 5`}
            />
          </Tiles>
        </Section>
      </div>

      <Section id="custom" title="Custom orders">
        <p className="text-sm text-muted-foreground">
          Of the requests received in this period, how far each one has got so far.
        </p>
        <table className="w-full max-w-xl text-left text-sm">
          <caption className="sr-only">Custom order funnel</caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="py-2 font-medium">
                Stage
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Requests
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Of all requests
              </th>
            </tr>
          </thead>
          <tbody>
            <FunnelRow
              stage="Received"
              count={a.custom.requests}
              rate={a.custom.requests ? 100 : null}
            />
            <FunnelRow stage="Quoted" count={a.custom.quoted} rate={a.custom.quotedRate} />
            <FunnelRow
              stage="Deposit paid"
              count={a.custom.depositPaid}
              rate={a.custom.depositRate}
            />
            <FunnelRow stage="Completed" count={a.custom.completed} rate={a.custom.completedRate} />
            <FunnelRow
              stage="Cancelled"
              count={a.custom.cancelled}
              rate={percent(a.custom.cancelled, a.custom.requests)}
            />
          </tbody>
        </table>
        <p className="text-sm">
          Typical time from request to completion:{" "}
          <span className="font-medium" data-testid="median-days">
            {a.custom.medianDaysToComplete === null
              ? "no orders completed in this period"
              : `${a.custom.medianDaysToComplete} ${a.custom.medianDaysToComplete === 1 ? "day" : "days"}`}
          </span>
        </p>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="demand" title="Most wanted">
          <p className="text-sm text-muted-foreground">
            Pieces with the most people waiting on a &ldquo;notify me&rdquo; request.
          </p>
          {a.demand.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is waiting on a piece.</p>
          ) : (
            <ol className="divide-y rounded-lg border text-sm">
              {a.demand.map((d) => (
                <li key={d.productId} className="flex items-center justify-between gap-3 p-3">
                  <Link href={`/shop/${d.slug}`} className="font-medium hover:underline">
                    {d.name}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    {d.waiting} waiting{d.soldOut ? " · sold out" : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section id="appointments" title="Appointments">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Appointments by type, excluding cancelled</caption>
            <tbody>
              {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => (
                <tr key={t} className="border-b">
                  <th scope="row" className="py-2 font-normal">
                    {TYPE_LABELS[t]}
                  </th>
                  <td className="py-2 text-right tabular-nums">{a.appointments.byType[t]}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-2 font-medium">
                  Total (not cancelled)
                </th>
                <td className="py-2 text-right font-medium tabular-nums">{a.appointments.total}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            No-shows:{" "}
            <span className="font-medium">
              {a.appointments.noShows} ({pct(a.appointments.noShowRate)} of past appointments)
            </span>
          </p>
        </Section>
      </div>
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tiles({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">{children}</dl>
  );
}

function Tile({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: string;
  testId?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
      {children ? <dd className="text-xs text-muted-foreground">{children}</dd> : null}
    </div>
  );
}

function FunnelRow({ stage, count, rate }: { stage: string; count: number; rate: number | null }) {
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="py-2 font-normal">
        {stage}
      </th>
      <td className="py-2 text-right tabular-nums">{count}</td>
      <td className="py-2 text-right tabular-nums">{pct(rate)}</td>
    </tr>
  );
}
