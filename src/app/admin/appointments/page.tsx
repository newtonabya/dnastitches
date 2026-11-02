import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { AppointmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
} from "@/lib/scheduling/appointments";
import {
  addDays,
  localDateOf,
  parseLocalDate,
  startOfWeek,
  zonedTimeToUtc,
} from "@/lib/scheduling/time";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/guards";
import {
  type AdminAppointment,
  listAdminAppointments,
  listAppointmentsBetween,
} from "@/server/data/appointments";
import { bookingConfig } from "@/server/scheduling-config";

export const metadata: Metadata = { title: "Appointments" };

/** US-F2: calendar (week) and list views of appointments. */
export default function AppointmentsPage({ searchParams }: PageProps<"/admin/appointments">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Appointments</h1>
        <Link href="/admin/settings#booking" className="text-sm underline">
          Booking hours and blocked dates
        </Link>
      </div>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading appointments…
          </p>
        }
      >
        <Appointments searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Appointments({
  searchParams,
}: Pick<PageProps<"/admin/appointments">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const view = first(params.view) === "list" ? "list" : "week";
  const { timeZone } = bookingConfig();
  const now = new Date();

  const tabs = [
    { href: "/admin/appointments", label: "Week", active: view === "week" },
    { href: "/admin/appointments?view=list", label: "List", active: view === "list" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Appointment views">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <li key={t.href}>
              <Pill href={t.href} active={t.active}>
                {t.label}
              </Pill>
            </li>
          ))}
        </ul>
      </nav>
      {view === "week" ? (
        <Week weekParam={first(params.week)} timeZone={timeZone} now={now} />
      ) : (
        <List
          scope={first(params.scope) === "past" ? "past" : "upcoming"}
          status={Object.values(AppointmentStatus).find((s) => s === first(params.status))}
          timeZone={timeZone}
          now={now}
        />
      )}
    </div>
  );
}

async function Week({
  weekParam,
  timeZone,
  now,
}: {
  weekParam?: string;
  timeZone: string;
  now: Date;
}) {
  const today = localDateOf(now, timeZone);
  const monday = startOfWeek(weekParam && parseLocalDate(weekParam) ? weekParam : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = zonedTimeToUtc(monday, 0, timeZone)!;
  const to = zonedTimeToUtc(addDays(monday, 7), 0, timeZone)!;
  const appointments = await listAppointmentsBetween(prisma, from, to);
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(
      new Date(`${d}T12:00:00Z`),
    );

  return (
    <section aria-label="Week calendar" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">
          Week of {fmtDay(monday, { day: "numeric", month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-2 text-sm">
          <Pill href={`/admin/appointments?week=${addDays(monday, -7)}`}>← Previous</Pill>
          <Pill href="/admin/appointments">This week</Pill>
          <Pill href={`/admin/appointments?week=${addDays(monday, 7)}`}>Next →</Pill>
        </div>
      </div>
      <ol className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const items = appointments.filter((a) => localDateOf(a.startsAt, timeZone) === d);
          return (
            <li
              key={d}
              aria-label={fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}
              className={cn(
                "flex min-h-32 flex-col gap-2 rounded-lg border p-2",
                d === today && "border-primary",
              )}
            >
              <h3 className="text-sm font-semibold">
                {fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}
                {d === today ? (
                  <span className="font-normal text-muted-foreground"> · today</span>
                ) : null}
              </h3>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing booked</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/admin/appointments/${a.id}`}
                        className={cn(
                          "flex flex-col rounded-md border p-2 text-xs hover:bg-accent",
                          // Inactive: a muted background, not reduced opacity (which fails
                          // WCAG AA contrast).
                          !["REQUESTED", "CONFIRMED"].includes(a.status) && "bg-muted",
                          a.status === "REQUESTED" && "border-dashed border-primary",
                        )}
                      >
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            (a.status === "CANCELLED" || a.status === "NO_SHOW") && "line-through",
                          )}
                        >
                          {time(a.startsAt, timeZone)}–{time(a.endsAt, timeZone)}
                        </span>
                        <span>{a.user.name ?? a.user.email}</span>
                        <span className="text-muted-foreground">
                          {APPOINTMENT_TYPE_LABELS[a.type]} · {APPOINTMENT_STATUS_LABELS[a.status]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        Times are in {timeZone}. Dashed cards are requests waiting for you to confirm; grey cards
        are past or cancelled.
      </p>
    </section>
  );
}

async function List({
  scope,
  status,
  timeZone,
  now,
}: {
  scope: "upcoming" | "past";
  status?: AppointmentStatus;
  timeZone: string;
  now: Date;
}) {
  const appointments = await listAdminAppointments(prisma, { scope, status, now });
  const href = (s: { scope?: string; status?: string }) => {
    const q = new URLSearchParams({ view: "list" });
    if ((s.scope ?? scope) === "past") q.set("scope", "past");
    const st = "status" in s ? s.status : status;
    if (st) q.set("status", st);
    return `/admin/appointments?${q}`;
  };
  return (
    <section aria-label="Appointment list" className="flex flex-col gap-4">
      <nav aria-label="Filter appointments" className="flex flex-wrap gap-2 text-sm">
        <Pill href={href({ scope: "upcoming" })} active={scope === "upcoming"}>
          Upcoming
        </Pill>
        <Pill href={href({ scope: "past" })} active={scope === "past"}>
          Past
        </Pill>
        <span aria-hidden className="mx-1 border-l" />
        <Pill href={href({ status: undefined })} active={!status}>
          Any status
        </Pill>
        {Object.values(AppointmentStatus).map((s) => (
          <Pill key={s} href={href({ status: s })} active={status === s}>
            {APPOINTMENT_STATUS_LABELS[s]}
          </Pill>
        ))}
      </nav>
      {appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {appointments.map((a) => (
            <ListRow key={a.id} appointment={a} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ListRow({
  appointment: a,
  timeZone,
}: {
  appointment: AdminAppointment;
  timeZone: string;
}) {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(a.startsAt);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <div className="flex flex-col">
        <Link href={`/admin/appointments/${a.id}`} className="font-medium underline">
          {date}, {time(a.startsAt, timeZone)}–{time(a.endsAt, timeZone)}
        </Link>
        <span className="text-muted-foreground">
          {a.user.name ?? a.user.email} · {APPOINTMENT_TYPE_LABELS[a.type]} ·{" "}
          {APPOINTMENT_MODE_LABELS[a.mode]}
          {a.customOrder ? ` · ${a.customOrder.reference}` : ""}
        </span>
      </div>
      <Badge
        variant={
          a.status === "REQUESTED" ? "default" : a.status === "CONFIRMED" ? "secondary" : "outline"
        }
      >
        {APPOINTMENT_STATUS_LABELS[a.status]}
      </Badge>
    </li>
  );
}

function time(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
