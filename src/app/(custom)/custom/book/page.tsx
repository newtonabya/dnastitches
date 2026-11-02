import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BookingForm, RescheduleForm } from "@/components/scheduling/booking-form";
import { LocalTime } from "@/components/scheduling/local-time";
import { prisma } from "@/lib/prisma";
import { canCustomerChange } from "@/lib/scheduling/appointments";
import {
  bookConsultationAction,
  rescheduleOwnAppointmentAction,
} from "@/server/actions/appointments";
import { requireUser } from "@/server/auth/guards";
import {
  getAvailableSlots,
  getUserAppointment,
  listLinkableOrders,
} from "@/server/data/appointments";
import { bookingConfig } from "@/server/scheduling-config";

export const metadata: Metadata = {
  title: "Book a consultation",
  description: "Book an in-studio or video consultation with DNA Stitches.",
};

/** US-F1: book (or move) a consultation in a free slot over the next 30 days. */
export default function BookPage({ searchParams }: PageProps<"/custom/book">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading available times…
          </p>
        }
      >
        <Book searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Book({ searchParams }: Pick<PageProps<"/custom/book">, "searchParams">) {
  const params = await searchParams;
  const orderParam = typeof params.order === "string" ? params.order : undefined;
  const rescheduleId = typeof params.reschedule === "string" ? params.reschedule : undefined;
  const query = new URLSearchParams(
    Object.entries({ order: orderParam, reschedule: rescheduleId }).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  ).toString();
  const user = await requireUser(`/custom/book${query ? `?${query}` : ""}`);
  const config = bookingConfig();
  const now = new Date();

  if (rescheduleId) {
    const appointment = await getUserAppointment(prisma, user.id, rescheduleId);
    if (!appointment || appointment.type !== "CONSULTATION" || !canCustomerChange(appointment, now))
      return (
        <Notice title="This appointment can't be moved online">
          Appointments can be moved up to 24 hours before they start.{" "}
          <Link href="/account/appointments" className="underline">
            Back to your appointments
          </Link>
        </Notice>
      );
    const slots = await getAvailableSlots(prisma, now, config, appointment.id);
    return (
      <>
        <Header title="Move your consultation">
          Currently{" "}
          <LocalTime
            iso={appointment.startsAt.toISOString()}
            endIso={appointment.endsAt.toISOString()}
            timeZone={config.timeZone}
          />
          . Choose a new time below.
        </Header>
        {slots.length === 0 ? (
          <NoSlots />
        ) : (
          <RescheduleForm
            appointmentId={appointment.id}
            slots={slots.map((s) => ({
              startsAt: s.startsAt.toISOString(),
              localDate: s.localDate,
            }))}
            timeZone={config.timeZone}
            action={rescheduleOwnAppointmentAction}
          />
        )}
      </>
    );
  }

  const [slots, orders] = await Promise.all([
    getAvailableSlots(prisma, now, config),
    listLinkableOrders(prisma, user.id),
  ]);
  return (
    <>
      <Header title="Book a consultation">
        A {config.durationMinutes}-minute chat about your piece: in the studio or by video. Pick a
        time in the next 30 days.
      </Header>
      {slots.length === 0 ? (
        <NoSlots />
      ) : (
        <BookingForm
          slots={slots.map((s) => ({ startsAt: s.startsAt.toISOString(), localDate: s.localDate }))}
          timeZone={config.timeZone}
          orders={orders}
          defaultOrderId={orders.some((o) => o.id === orderParam) ? orderParam : undefined}
          autoConfirm={config.autoConfirm}
          action={bookConsultationAction}
        />
      )}
    </>
  );
}

function Header({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
    </header>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function NoSlots() {
  return (
    <p className="rounded-md border border-dashed p-6 text-sm">
      There are no free times in the next 30 days. Please check back soon, or{" "}
      <Link href="/custom/request" className="underline">
        send us your request
      </Link>{" "}
      and we&apos;ll arrange a time with you.
    </p>
  );
}
