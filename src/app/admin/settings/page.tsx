import type { Metadata } from "next";
import { Suspense } from "react";

import { DeliveryZoneForm } from "@/components/admin/catalog-forms";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { saveDeliveryZoneAction } from "@/server/actions/admin/settings";
import { requireAdmin } from "@/server/auth/guards";
import { listDeliveryZones, overlappingStates } from "@/server/data/admin/settings";

export const metadata: Metadata = { title: "Settings" };

/** Delivery zones (D-12) and read-only business settings. */
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading settings…
          </p>
        }
      >
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  await requireAdmin();
  const zones = await listDeliveryZones(prisma);
  const overlaps = overlappingStates(zones);
  const placeholders = zones.filter((z) => z.isActive && z.name.startsWith("PLACEHOLDER"));

  return (
    <>
      <section aria-label="Delivery zones" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Delivery zones</h2>
        <p className="text-sm text-muted-foreground">
          A flat delivery fee per zone. At checkout, the first active zone covering the
          customer&apos;s state sets the fee; if none covers it, only pickup is offered.
        </p>
        {placeholders.length > 0 ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            {placeholders.length} active zone(s) still have placeholder fees from the seed data.
            Replace them with real zones and fees before launch (D-12).
          </p>
        ) : null}
        {overlaps.size > 0 ? (
          <p
            role="alert"
            className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          >
            Some states are in more than one active zone:{" "}
            {[...overlaps].map(([state, names]) => `${state} (${names.join(", ")})`).join("; ")}.
            Only the first match is used.
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {zones.map((z) => (
            <li key={z.id} className="rounded-lg border p-4">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <span className="font-medium">{z.name}</span>
                  {z.isActive ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {formatNGN(z.feeKobo)} · {z.etaDays} days · {z.states.join(", ")}
                  </span>
                </summary>
                <div className="mt-4">
                  <DeliveryZoneForm values={z} action={saveDeliveryZoneAction} />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 font-semibold">Add a zone</h3>
          <DeliveryZoneForm
            values={{ name: "", states: [], feeKobo: null, etaDays: 3, isActive: true }}
            action={saveDeliveryZoneAction}
          />
        </div>
      </section>

      <section aria-label="Business settings" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Business settings</h2>
        <p className="text-sm text-muted-foreground">
          These are set with environment variables in Vercel (see the README).
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">Default deposit</dt>
            <dd>{env.DEPOSIT_PERCENT}% of the quote</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">Defect repair window</dt>
            <dd>{env.REPAIR_WINDOW_DAYS} days after handover</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">Minimum lead time for custom requests</dt>
            <dd>{env.MIN_LEAD_TIME_DAYS} days</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
