import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { RepairForm } from "@/components/account/repair-form";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { defectWindowEndsAt, isWithinDefectWindow } from "@/lib/repairs";
import { repairUploadPrefix } from "@/lib/uploads";
import { createRepairRequest } from "@/server/actions/repairs";
import { requireUser } from "@/server/auth/guards";
import { getRepairTarget } from "@/server/data/repairs";

export const metadata: Metadata = { title: "Report a defect" };

const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** US-D3 AC1–AC2: report a manufacturing defect within the repair window. */
export default function ReportDefectPage({ searchParams }: PageProps<"/account/wardrobe/repair">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/account/wardrobe" className="hover:underline">
          ← My Wardrobe
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        }
      >
        <ReportDefect searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ReportDefect({
  searchParams,
}: Pick<PageProps<"/account/wardrobe/repair">, "searchParams">) {
  const params = await searchParams;
  const order = typeof params.order === "string" ? params.order : null;
  const customOrder = typeof params.customOrder === "string" ? params.customOrder : null;
  const query = order ? `order=${order}` : customOrder ? `customOrder=${customOrder}` : "";
  const user = await requireUser(`/account/wardrobe/repair?${query}`);

  const kind = order ? "ORDER" : "CUSTOM_ORDER";
  const targetId = order ?? customOrder;
  // Scoped to the signed-in customer: someone else's order is simply "not found".
  const target = targetId ? await getRepairTarget(prisma, user.id, kind, targetId) : null;
  if (!target) notFound();

  const days = env.REPAIR_WINDOW_DAYS;
  const open = isWithinDefectWindow(target.handoverAt, new Date(), days);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Report a defect</h1>
        <p className="text-lg">
          {target.label}
          {target.reference ? (
            <span className="text-muted-foreground"> · {target.reference}</span>
          ) : null}
        </p>
      </header>

      {target.hasActiveRepair ? (
        <p className="rounded-md bg-muted p-4 text-sm">
          You already have an open repair request for this piece.{" "}
          <Link href="/account/wardrobe#repairs" className="underline">
            See its status
          </Link>
        </p>
      ) : !open ? (
        <p className="rounded-md bg-muted p-4 text-sm">
          Defects must be reported within {days} days of receiving your piece, so this piece is no
          longer covered.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Manufacturing defects reported within {days} days of handover are repaired or altered
            free of charge. You can report this one until{" "}
            {dateTime.format(defectWindowEndsAt(target.handoverAt!, days))}. We&apos;ll email you
            about every step. All sales are final, so we repair rather than refund.
          </p>
          <RepairForm
            kind={target.kind}
            targetId={target.id}
            pathPrefix={repairUploadPrefix(user.id)}
            uploadsEnabled={Boolean(env.BLOB_READ_WRITE_TOKEN)}
            action={createRepairRequest}
          />
        </>
      )}
    </div>
  );
}
