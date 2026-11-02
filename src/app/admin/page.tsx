import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { STATUS_LABELS } from "@/lib/custom-order/status";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth/guards";
import { countPendingRequests } from "@/server/data/appointments";
import {
  PIPELINE_STATUSES,
  countOrdersByStatus,
  listPipelineCards,
} from "@/server/data/admin/orders";

export const metadata: Metadata = { title: "Dashboard" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        }
      >
        <Summary />
      </Suspense>
    </main>
  );
}

async function Summary() {
  await requireAdmin();
  const [counts, cards, toFulfil, openRepairs, toConfirm] = await Promise.all([
    countOrdersByStatus(prisma),
    listPipelineCards(prisma),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.repairRequest.count({ where: { status: { in: ["OPEN", "IN_REPAIR"] } } }),
    countPendingRequests(prisma, new Date()),
  ]);
  const newRequests = cards.filter((c) => c.status === "REQUEST_RECEIVED").slice(0, 10);

  return (
    <>
      <section aria-labelledby="pipeline-heading" className="flex flex-col gap-3">
        <h2 id="pipeline-heading" className="text-lg font-semibold">
          Custom orders in progress
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {PIPELINE_STATUSES.map((status) => (
            <li key={status} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
              <p className="text-2xl font-semibold tabular-nums">{counts[status] ?? 0}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {counts.COMPLETED ?? 0} completed · {counts.CANCELLED ?? 0} cancelled ·{" "}
          <Link href="/admin/orders" className="underline">
            Open the pipeline
          </Link>
        </p>
      </section>

      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="text-lg font-semibold">
          Needs attention
        </h2>
        <ul className="flex flex-wrap gap-3 text-sm">
          <li>
            <Link
              href="/admin/orders?view=shop"
              className="flex flex-col rounded-lg border p-3 hover:bg-accent"
            >
              <span className="text-xs text-muted-foreground">Shop orders to fulfil</span>
              <span className="text-2xl font-semibold tabular-nums">{toFulfil}</span>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/appointments?view=list&status=REQUESTED"
              className="flex flex-col rounded-lg border p-3 hover:bg-accent"
            >
              <span className="text-xs text-muted-foreground">Appointments to confirm</span>
              <span className="text-2xl font-semibold tabular-nums">{toConfirm}</span>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/repairs"
              className="flex flex-col rounded-lg border p-3 hover:bg-accent"
            >
              <span className="text-xs text-muted-foreground">Open repairs</span>
              <span className="text-2xl font-semibold tabular-nums">{openRepairs}</span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="new-heading" className="flex flex-col gap-3">
        <h2 id="new-heading" className="text-lg font-semibold">
          New requests to triage
        </h2>
        {newRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new requests.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {newRequests.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <Link href={`/admin/orders/${c.id}`} className="font-medium hover:underline">
                  {c.reference} · {c.title}
                </Link>
                <span className="text-muted-foreground">
                  {c.customerName ?? c.customerEmail} · {dateTime.format(c.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
