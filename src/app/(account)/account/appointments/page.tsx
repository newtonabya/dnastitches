import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CancelAppointmentButton } from "@/components/scheduling/cancel-appointment";
import { LocalTime } from "@/components/scheduling/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import {
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  canCustomerChange,
} from "@/lib/scheduling/appointments";
import { cancelOwnAppointmentAction } from "@/server/actions/appointments";
import { requireUser } from "@/server/auth/guards";
import { type UserAppointment, listUserAppointments } from "@/server/data/appointments";
import { bookingConfig } from "@/server/scheduling-config";

export const metadata: Metadata = { title: "My appointments" };

const BANNERS = {
  booked: "Thanks! We've emailed you the details with a calendar invite.",
  moved: "Your appointment has moved. We've emailed you an updated invite.",
  cancelled: "Appointment cancelled. We've emailed you a confirmation.",
} as const;

/** US-F1 AC5: my appointments; cancel or move up to 24 h before. */
export default function AppointmentsPage({ searchParams }: PageProps<"/account/appointments">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">My appointments</h1>
        <Button asChild>
          <Link href="/custom/book">Book a consultation</Link>
        </Button>
      </div>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading your appointments…
          </p>
        }
      >
        <Appointments searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Appointments({
  searchParams,
}: Pick<PageProps<"/account/appointments">, "searchParams">) {
  const user = await requireUser("/account/appointments");
  const now = new Date();
  const [{ upcoming, past }, params] = await Promise.all([
    listUserAppointments(prisma, user.id, now),
    searchParams,
  ]);
  const banner = params.booked
    ? BANNERS.booked
    : params.moved
      ? BANNERS.moved
      : params.cancelled
        ? BANNERS.cancelled
        : null;
  const { timeZone } = bookingConfig();

  return (
    <>
      {banner ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {banner}
        </p>
      ) : null}
      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-xl font-semibold">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((a) => (
              <li key={a.id}>
                <AppointmentCard appointment={a} timeZone={timeZone} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="flex flex-col gap-3">
          <h2 id="past-heading" className="text-xl font-semibold">
            Past and cancelled
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((a) => (
              <li key={a.id}>
                <AppointmentCard appointment={a} timeZone={timeZone} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function AppointmentCard({
  appointment: a,
  timeZone,
  now,
}: {
  appointment: UserAppointment;
  timeZone: string;
  now: Date;
}) {
  const label = `${APPOINTMENT_TYPE_LABELS[a.type]} on ${new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium" }).format(a.startsAt)}`;
  const changeable = canCustomerChange(a, now);
  const upcomingActive = a.status === "REQUESTED" || a.status === "CONFIRMED";
  return (
    <article aria-label={label} className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {APPOINTMENT_TYPE_LABELS[a.type]} · {APPOINTMENT_MODE_LABELS[a.mode]}
        </span>
        <Badge
          data-testid="appointment-status"
          variant={
            a.status === "CONFIRMED"
              ? "default"
              : a.status === "REQUESTED"
                ? "secondary"
                : "outline"
          }
        >
          {APPOINTMENT_STATUS_LABELS[a.status]}
        </Badge>
      </div>
      <LocalTime
        iso={a.startsAt.toISOString()}
        endIso={a.endsAt.toISOString()}
        timeZone={timeZone}
      />
      {a.customOrder ? (
        <p className="text-muted-foreground">
          For{" "}
          <Link href={`/account/wardrobe/${a.customOrder.id}`} className="underline">
            {a.customOrder.title} ({a.customOrder.reference})
          </Link>
        </p>
      ) : null}
      {a.status === "REQUESTED" ? (
        <p className="text-muted-foreground">We&apos;ll confirm this time by email.</p>
      ) : null}
      {changeable ? (
        <div className="flex flex-wrap items-start gap-2">
          {a.type === "CONSULTATION" ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/custom/book?reschedule=${a.id}`} aria-label={`Move ${label}`}>
                Move
              </Link>
            </Button>
          ) : null}
          <CancelAppointmentButton
            appointmentId={a.id}
            label={label}
            action={cancelOwnAppointmentAction}
          />
        </div>
      ) : upcomingActive ? (
        <p className="text-muted-foreground">
          It&apos;s less than 24 hours away, so please contact us to change it.
        </p>
      ) : null}
    </article>
  );
}
