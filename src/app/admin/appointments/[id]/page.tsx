import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  AdminRescheduleForm,
  AppointmentNotesForm,
  AppointmentStatusButtons,
} from "@/components/admin/appointment-forms";
import { LocalTime } from "@/components/scheduling/local-time";
import { Badge } from "@/components/ui/badge";
import { formatNigerianPhone } from "@/lib/nigeria";
import { prisma } from "@/lib/prisma";
import {
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TRANSITIONS,
  APPOINTMENT_TYPE_LABELS,
  isActiveAppointment,
  needsStarted,
} from "@/lib/scheduling/appointments";
import { MAX_REMINDER_ATTEMPTS, needsReminders } from "@/lib/scheduling/reminders";
import { formatMinute, localDateOf, localMinuteOf } from "@/lib/scheduling/time";
import {
  rescheduleAppointmentAction,
  saveAppointmentNotesAction,
  setAppointmentStatusAction,
} from "@/server/actions/admin/appointments";
import { requireAdmin } from "@/server/auth/guards";
import { getAdminAppointment } from "@/server/data/appointments";
import { listAppointmentReminders } from "@/server/data/reminders";
import { bookingConfig } from "@/server/scheduling-config";

export const metadata: Metadata = { title: "Appointment" };

/** US-F2: confirm, reschedule, complete / no-show / cancel one appointment. */
export default function AdminAppointmentPage({ params }: PageProps<"/admin/appointments/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/appointments" className="hover:underline">
          ← Appointments
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading appointment…
          </p>
        }
      >
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/appointments/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  const [a, reminders] = await Promise.all([
    getAdminAppointment(prisma, id),
    listAppointmentReminders(prisma, id),
  ]);
  if (!a) notFound();
  const reminderTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: bookingConfig().timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const { timeZone } = bookingConfig();
  const now = new Date();
  // Completed / no-show only appear once the appointment has started.
  const next = APPOINTMENT_TRANSITIONS[a.status].filter(
    (s) => !needsStarted(s) || a.startsAt <= now,
  );
  const city = timeZone.split("/").pop()!.replace(/_/g, " ");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {APPOINTMENT_TYPE_LABELS[a.type]}
          </h1>
          <Badge data-testid="appointment-status">{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>
        </div>
        <p className="text-lg">
          <LocalTime
            iso={a.startsAt.toISOString()}
            endIso={a.endsAt.toISOString()}
            timeZone={timeZone}
          />
        </p>
        <p className="text-sm text-muted-foreground">
          {APPOINTMENT_MODE_LABELS[a.mode]} ·{" "}
          <Link href={`/admin/clients/${a.user.id}`} className="underline">
            {a.user.name ?? a.user.email}
          </Link>{" "}
          · {a.user.email}
          {a.user.phone ? ` · ${formatNigerianPhone(a.user.phone)}` : ""}
        </p>
        {a.customOrder ? (
          <p className="text-sm">
            For{" "}
            <Link href={`/admin/orders/${a.customOrder.id}`} className="underline">
              {a.customOrder.title} ({a.customOrder.reference})
            </Link>
          </p>
        ) : null}
        {a.notes ? (
          <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">
            <span className="font-medium">From the customer:</span> {a.notes}
          </p>
        ) : null}
      </header>

      {next.length > 0 ? (
        <Section title="Status">
          <AppointmentStatusButtons
            appointmentId={a.id}
            next={next}
            action={setAppointmentStatusAction}
          />
          {a.status === "CONFIRMED" && a.startsAt > now ? (
            <p className="text-xs text-muted-foreground">
              You can mark it completed or no-show once it has started.
            </p>
          ) : null}
        </Section>
      ) : null}

      {isActiveAppointment(a.status) ? (
        <Section title="Reschedule">
          <p className="text-sm text-muted-foreground">
            Any free time works, even outside the booking hours. The customer gets an updated
            calendar invite.
          </p>
          <AdminRescheduleForm
            appointmentId={a.id}
            date={localDateOf(a.startsAt, timeZone)}
            time={formatMinute(localMinuteOf(a.startsAt, timeZone))}
            timeZoneLabel={`${city} time`}
            action={rescheduleAppointmentAction}
          />
        </Section>
      ) : null}

      {reminders.length > 0 || needsReminders(a) ? (
        <Section title="Reminders">
          {reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reminders: both reminder times had passed when this was booked.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Reminder emails">
              {reminders.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">
                    {r.channel === "SMS" ? "Text" : "Email"}, {r.offsetMinutes / 60} h before
                  </span>{" "}
                  ·{" "}
                  {r.sentAt
                    ? `sent ${reminderTime.format(r.sentAt)}`
                    : r.skippedAt
                      ? (r.error ?? "skipped")
                      : r.attempts >= MAX_REMINDER_ATTEMPTS
                        ? `failed after ${r.attempts} attempts: ${r.error ?? "unknown error"}`
                        : `due ${reminderTime.format(r.sendAt)}${r.attempts > 0 ? ` (retrying after ${r.attempts} failed attempt${r.attempts === 1 ? "" : "s"}: ${r.error ?? "unknown error"})` : ""}`}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Fittings and pickups get email reminders 48 hours and 3 hours before, plus texts for
            customers who opted in on their profile.
          </p>
        </Section>
      ) : null}

      <Section title="Notes">
        <AppointmentNotesForm
          appointmentId={a.id}
          adminNotes={a.adminNotes}
          action={saveAppointmentNotesAction}
        />
      </Section>
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
