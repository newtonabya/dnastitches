import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { RepairUpdateForm } from "@/components/admin/repair-update-form";
import { Badge } from "@/components/ui/badge";
import { RepairStatus } from "@/generated/prisma/enums";
import { formatNigerianPhone } from "@/lib/nigeria";
import { prisma } from "@/lib/prisma";
import { REPAIR_STATUS_LABELS } from "@/lib/repairs";
import { cn } from "@/lib/utils";
import { updateRepairRequest } from "@/server/actions/admin/repairs";
import { requireAdmin } from "@/server/auth/guards";
import { type AdminRepair, listAdminRepairs } from "@/server/data/repairs";

export const metadata: Metadata = { title: "Repair requests" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** US-D3 AC3: defect reports, active first, moved OPEN → IN_REPAIR → RESOLVED or REJECTED. */
export default function RepairRequestsPage({ searchParams }: PageProps<"/admin/repairs">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Repair requests</h1>
        <p className="text-sm text-muted-foreground">
          Free repairs for manufacturing defects reported within the repair window. Repairs never
          involve a payment or refund.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading repairs…
          </p>
        }
      >
        <Repairs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Repairs({ searchParams }: Pick<PageProps<"/admin/repairs">, "searchParams">) {
  await requireAdmin();
  const raw = (await searchParams).status;
  const status = Object.values(RepairStatus).find((s) => s === raw);
  const repairs = await listAdminRepairs(prisma, status);
  const filters = [
    { value: undefined, label: "All" },
    ...Object.values(RepairStatus).map((s) => ({ value: s, label: REPAIR_STATUS_LABELS[s] })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter repairs">
        <ul className="flex flex-wrap gap-2 text-sm">
          {filters.map((f) => (
            <li key={f.label}>
              <Link
                href={f.value ? `/admin/repairs?status=${f.value}` : "/admin/repairs"}
                aria-current={status === f.value ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3",
                  status === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {repairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No repair requests.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {repairs.map((r) => (
            <li key={r.id}>
              <RepairCard repair={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RepairCard({ repair: r }: { repair: AdminRepair }) {
  const item = r.order
    ? r.order.product.name
    : r.customOrder
      ? `${r.customOrder.title} (${r.customOrder.reference})`
      : "Piece";
  const customer = r.user.name ?? r.user.email;
  return (
    <article
      aria-label={`Repair: ${item}`}
      className="grid gap-4 rounded-lg border p-4 text-sm md:grid-cols-[1fr_18rem]"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            data-testid="repair-status"
            variant={
              r.status === "OPEN" ? "default" : r.status === "IN_REPAIR" ? "secondary" : "outline"
            }
          >
            {REPAIR_STATUS_LABELS[r.status]}
          </Badge>
          <span className="font-medium">
            {r.customOrder ? (
              <Link href={`/admin/orders/${r.customOrder.id}`} className="underline">
                {item}
              </Link>
            ) : r.order ? (
              <Link href={`/shop/${r.order.product.slug}`} className="underline">
                {item}
              </Link>
            ) : (
              item
            )}
          </span>
        </div>
        <p className="text-muted-foreground">
          <Link href={`/admin/clients/${r.user.id}`} className="underline">
            {customer}
          </Link>{" "}
          · {r.user.email}
          {r.user.phone ? ` · ${formatNigerianPhone(r.user.phone)}` : ""} · reported{" "}
          {dateTime.format(r.createdAt)}
          {r.resolvedAt ? ` · closed ${dateTime.format(r.resolvedAt)}` : ""}
        </p>
        <p className="whitespace-pre-line">{r.description}</p>
        {r.rejectionReason ? (
          <p>
            <span className="font-medium">Reason given:</span> {r.rejectionReason}
          </p>
        ) : null}
        {r.photoUrls.length > 0 ? (
          <ul className="flex gap-2" aria-label="Defect photos">
            {r.photoUrls.map((url, i) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block size-20 overflow-hidden rounded-md bg-muted"
                >
                  <Image
                    src={url}
                    alt={`Defect photo ${i + 1}`}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <RepairUpdateForm
        repairId={r.id}
        status={r.status}
        adminNotes={r.adminNotes}
        label={`${item}, ${customer}`}
        action={updateRepairRequest}
      />
    </article>
  );
}
