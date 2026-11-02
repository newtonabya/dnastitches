import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MeasurementProfileForm } from "@/components/account/measurement-profile-form";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/custom-order/status";
import { type DiffableField, diffMeasurementProfiles } from "@/lib/measurement-diff";
import { formatNGN } from "@/lib/money";
import { formatNigerianPhone } from "@/lib/nigeria";
import { prisma } from "@/lib/prisma";
import { REPAIR_STATUS_LABELS } from "@/lib/repairs";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS } from "@/lib/scheduling/appointments";
import { cn } from "@/lib/utils";
import { MEASUREMENT_FIELDS } from "@/lib/validators/measurements";
import { recordClientMeasurementAction } from "@/server/actions/admin/clients";
import { requireAdmin } from "@/server/auth/guards";
import { getClientProfile } from "@/server/data/admin/clients";
import type { MeasurementProfileView } from "@/server/data/measurements";

export const metadata: Metadata = { title: "Client profile" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});
const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

/** US-C2 AC2–3: one client's full history. */
export default function ClientProfilePage({ params }: PageProps<"/admin/clients/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/clients" className="hover:underline">
          ← Clients
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading client…
          </p>
        }
      >
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: Pick<PageProps<"/admin/clients/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  const profile = await getClientProfile(prisma, id);
  if (!profile) notFound();
  const { user } = profile;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{user.name ?? user.email}</h1>
        <p className="text-sm text-muted-foreground">
          {user.email}
          {user.phone ? ` · ${formatNigerianPhone(user.phone)}` : ""} · client since{" "}
          {dateFormat.format(user.createdAt)}
          {user.role === "ADMIN" ? " · admin" : ""}
        </p>
        {profile.addresses.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Addresses:{" "}
            {profile.addresses
              .map((a) => `${a.line1}, ${a.city}, ${a.state}${a.isDefault ? " (default)" : ""}`)
              .join(" · ")}
          </p>
        ) : null}
      </header>

      <Section title={`Custom orders (${profile.customOrders.length})`}>
        {profile.customOrders.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {profile.customOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                  {o.reference} · {o.title}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{STATUS_LABELS[o.status]}</Badge>
                  <span className="text-muted-foreground">{dateFormat.format(o.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Measurements (${profile.measurements.length} versions)`}>
        <MeasurementHistory versions={profile.measurements} />
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer font-medium">
            Record new measurements for this client
          </summary>
          <div className="mt-4">
            <MeasurementProfileForm
              action={recordClientMeasurementAction}
              hiddenFields={{ userId: user.id }}
              submitLabel="Save measurements (taken by atelier)"
            />
          </div>
        </details>
      </Section>

      <Section title={`Ready-to-wear orders (${profile.orders.length})`}>
        {profile.orders.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {profile.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  {o.product.name} · {o.fulfillmentMethod.toLowerCase()} ·{" "}
                  {o.status.toLowerCase().replace(/_/g, " ")}
                </span>
                <span className="tabular-nums">
                  {formatNGN(o.totalKobo)} · {dateFormat.format(o.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Payments (${profile.payments.length})`}>
        {profile.payments.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {profile.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  {p.kind.replace(/_/g, " ").toLowerCase()} · {p.channel.toLowerCase()} ·{" "}
                  {p.status.toLowerCase()}
                  {p.customOrder ? ` · ${p.customOrder.reference}` : ""}
                </span>
                <span className="tabular-nums">
                  {formatNGN(p.amountKobo)} · {dateTime.format(p.paidAt ?? p.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-10 md:grid-cols-3">
        <Section title={`Repair requests (${profile.repairRequests.length})`}>
          {profile.repairRequests.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {profile.repairRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/repairs?status=${r.status}`} className="underline">
                    {REPAIR_STATUS_LABELS[r.status]}
                  </Link>{" "}
                  · {dateFormat.format(r.createdAt)}
                  <p className="line-clamp-2 text-muted-foreground">{r.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Appointments (${profile.appointments.length})`}>
          {profile.appointments.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {profile.appointments.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/appointments/${a.id}`} className="underline">
                    {APPOINTMENT_TYPE_LABELS[a.type]}
                  </Link>{" "}
                  · {APPOINTMENT_STATUS_LABELS[a.status]} · {dateTime.format(a.startsAt)}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Notify-me requests (${profile.notificationRequests.length})`}>
          {profile.notificationRequests.length === 0 ? (
            <Empty />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {profile.notificationRequests.map((n) => (
                <li key={n.id}>
                  {n.type === "RESTOCK" ? "Restock" : "Similar fabric"} · {n.product?.name ?? "—"} ·{" "}
                  {dateFormat.format(n.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/** All versions, newest first; fields changed since the previous version are highlighted (US-C2 AC2). */
function MeasurementHistory({ versions }: { versions: MeasurementProfileView[] }) {
  if (versions.length === 0) return <Empty />;
  const byId = new Map(versions.map((v) => [v.id, v]));
  return (
    <ol className="flex flex-col gap-4">
      {versions.map((v) => {
        const previous = v.previousVersionId ? byId.get(v.previousVersionId) : undefined;
        const changed = diffMeasurementProfiles(previous, v);
        const unit = v.unit === "IN" ? "in" : "cm";
        return (
          <li
            key={v.id}
            aria-label={`Measurements: ${v.label}, ${dateFormat.format(v.createdAt)}`}
            className="rounded-md border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn("font-medium", changed.has("label") && "rounded bg-brand/15 px-1")}
              >
                {v.label}
              </span>
              {v.isDefault ? <Badge variant="secondary">Default</Badge> : null}
              {v.previousVersionId ? <Badge variant="outline">Revised</Badge> : null}
              <span className="text-xs text-muted-foreground">
                {dateTime.format(v.createdAt)} · {unit} · taken by{" "}
                {v.takenBy === "ADMIN" ? "atelier" : "customer"}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              {MEASUREMENT_FIELDS.filter((f) => v[f.key] !== null || changed.has(f.key)).map(
                (f) => (
                  <Field
                    key={f.key}
                    label={f.label}
                    changed={changed.has(f.key as DiffableField)}
                    previous={previous?.[f.key] ?? null}
                    unit={unit}
                  >
                    {v[f.key] ?? "—"}
                  </Field>
                ),
              )}
            </dl>
            {v.notes ? (
              <p
                className={cn(
                  "mt-2 text-muted-foreground",
                  changed.has("notes") && "rounded bg-brand/15 px-1",
                )}
              >
                {v.notes}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  changed,
  previous,
  unit,
  children,
}: {
  label: string;
  changed: boolean;
  previous: number | null;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(changed && "rounded bg-brand/15 px-1")} data-changed={changed || undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        {children} {unit}
        {changed ? (
          <span className="text-xs text-muted-foreground"> (was {previous ?? "—"})</span>
        ) : null}
      </dd>
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

function Empty() {
  return <p className="text-sm text-muted-foreground">None yet.</p>;
}
