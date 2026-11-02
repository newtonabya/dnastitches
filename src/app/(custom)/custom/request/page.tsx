import type { Metadata } from "next";
import { Suspense } from "react";

import { RequestStepper } from "@/components/custom/request-stepper";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { submitCustomOrder } from "@/server/actions/custom-order";
import { requireUser } from "@/server/auth/guards";
import { resolveCustomRequestPrefill } from "@/server/custom/prefill";
import { getAccountProfile } from "@/server/data/account";
import { listCurrentProfiles } from "@/server/data/measurements";
import { getAvailableSwatches } from "@/server/loaders/portfolio";

export const metadata: Metadata = { title: "Request a custom piece" };

/** US-B1 (+ US-A3, US-B2 pre-fill): the multi-step custom request. Sign-in required (D-10). */
export default function CustomRequestPage({ searchParams }: PageProps<"/custom/request">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Request a custom piece</h1>
        <p className="text-sm text-muted-foreground">
          Four short steps. You can go back and change anything before you submit.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading the request form…
          </p>
        }
      >
        <RequestContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function RequestContent({
  searchParams,
}: Pick<PageProps<"/custom/request">, "searchParams">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const fromProduct = first(params.fromProduct);
  const fromPortfolio = first(params.fromPortfolio);

  const query = new URLSearchParams();
  if (fromProduct) query.set("fromProduct", fromProduct);
  if (fromPortfolio) query.set("fromPortfolio", fromPortfolio);
  const user = await requireUser(`/custom/request${query.size ? `?${query}` : ""}`);

  const [prefill, swatches, profiles, account] = await Promise.all([
    resolveCustomRequestPrefill(prisma, { fromProduct, fromPortfolio }),
    getAvailableSwatches(),
    listCurrentProfiles(prisma, user.id),
    getAccountProfile(prisma, user.id),
  ]);

  return (
    <RequestStepper
      prefill={prefill}
      swatches={swatches}
      profiles={profiles.map((p) => ({ id: p.id, label: p.label, isDefault: p.isDefault }))}
      addresses={(account?.addresses ?? []).map((a) => ({
        id: a.id,
        summary: `${a.recipientName}, ${a.line1}, ${a.city}, ${a.state}`,
        isDefault: a.isDefault,
      }))}
      userId={user.id}
      uploadsEnabled={Boolean(env.BLOB_READ_WRITE_TOKEN)}
      minLeadTimeDays={env.MIN_LEAD_TIME_DAYS}
      timeZone={env.STUDIO_TIMEZONE}
      action={submitCustomOrder}
    />
  );
}
