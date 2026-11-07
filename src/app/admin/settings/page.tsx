import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AvailabilityRuleForm,
  BlackoutDateForm,
  RemoveButton,
} from "@/components/admin/appointment-forms";
import { DeliveryZoneForm } from "@/components/admin/catalog-forms";
import { DemoContentButtons } from "@/components/admin/demo-content";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatMinute } from "@/lib/scheduling/time";
import {
  addAvailabilityRuleAction,
  addBlackoutDateAction,
  deleteAvailabilityRuleAction,
  deleteBlackoutDateAction,
} from "@/server/actions/admin/appointments";
import { demoContentAction } from "@/server/actions/admin/demo";
import { saveDeliveryZoneAction } from "@/server/actions/admin/settings";
import { requireAdmin } from "@/server/auth/guards";
import { demoContentSummary } from "@/server/data/admin/demo";
import { listDeliveryZones, overlappingStates } from "@/server/data/admin/settings";
import { listAvailability } from "@/server/data/appointments";

export const metadata: Metadata = { title: "Settings" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Delivery zones (D-12), booking hours (US-F1), read-only business settings and demo content. */
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
  const [zones, availability, demo] = await Promise.all([
    listDeliveryZones(prisma),
    listAvailability(prisma, new Date()),
    demoContentSummary(prisma),
  ]);
  const hasDemo = demo.products + demo.swatches + demo.portfolio + demo.zones > 0;
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

      <section id="booking" aria-label="Booking hours" className="flex scroll-mt-20 flex-col gap-4">
        <h2 className="text-xl font-semibold">Booking hours</h2>
        <p className="text-sm text-muted-foreground">
          Customers can book {env.CONSULTATION_MINUTES}-minute consultations inside these weekly
          hours ({env.STUDIO_TIMEZONE} time), at least 24 hours ahead and up to 30 days out.
          {env.APPOINTMENTS_AUTO_CONFIRM
            ? " Bookings are confirmed automatically."
            : " You confirm each booking in Appointments."}
        </p>
        {availability.rules.length === 0 ? (
          <p
            role="alert"
            className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          >
            No booking hours yet, so customers can&apos;t book consultations.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm" aria-label="Weekly hours">
            {availability.rules.map((r) => {
              const label = `${WEEKDAYS[r.weekday]} ${formatMinute(r.startMinute)}–${r.endMinute === 1440 ? "24:00" : formatMinute(r.endMinute)}`;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{label}</span>
                  <RemoveButton id={r.id} label={label} action={deleteAvailabilityRuleAction} />
                </li>
              );
            })}
          </ul>
        )}
        <AvailabilityRuleForm action={addAvailabilityRuleAction} />

        <h3 className="mt-2 font-semibold">Blocked dates</h3>
        <p className="text-sm text-muted-foreground">
          No bookings can be made on these days (holidays, travel). Existing appointments are kept:
          move or cancel them in Appointments.
        </p>
        {availability.blackouts.length > 0 ? (
          <ul className="divide-y rounded-lg border text-sm" aria-label="Blocked dates">
            {availability.blackouts.map((b) => {
              const label = new Intl.DateTimeFormat("en-GB", {
                timeZone: "UTC",
                weekday: "short",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(`${b.date}T12:00:00Z`));
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    {label}
                    {b.reason ? <span className="text-muted-foreground"> · {b.reason}</span> : null}
                  </span>
                  <RemoveButton id={b.id} label={label} action={deleteBlackoutDateAction} />
                </li>
              );
            })}
          </ul>
        ) : null}
        <BlackoutDateForm action={addBlackoutDateAction} />
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

      <section aria-label="Demo content" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Demo content</h2>
        <p className="text-sm text-muted-foreground">
          Sample products, fabric swatches, portfolio pieces and delivery zones, so the site can be
          shown and tested before the real catalogue is ready. Demo images are marked
          &ldquo;DEMO&rdquo;, and removing the demo content leaves everything you added yourself
          untouched.
        </p>
        {hasDemo ? (
          <p
            role="alert"
            className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          >
            The site is showing demo content: {demo.products} product(s), {demo.swatches}{" "}
            swatch(es), {demo.portfolio} portfolio piece(s) and {demo.zones} delivery zone(s).
            Remove it before launch.
          </p>
        ) : null}
        {env.DEMO_ACCESS_CODE ? (
          <p
            role="alert"
            className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
          >
            Demo sign-in is on: anyone with the demo passcode can sign in as any email, admins
            included. Delete DEMO_ACCESS_CODE in Vercel and redeploy before launch.
          </p>
        ) : null}
        <DemoContentButtons hasDemo={hasDemo} action={demoContentAction} />
      </section>
    </>
  );
}
