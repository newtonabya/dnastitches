import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { TERMINAL_STATUSES } from "@/lib/custom-order/status";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  BOOKING_MIN_NOTICE_HOURS,
  canCustomerChange,
  canTransitionAppointment,
  needsStarted,
} from "@/lib/scheduling/appointments";
import {
  BOOKING_WINDOW_DAYS,
  type Interval,
  type SlotOptions,
  generateSlots,
  isOfferedSlot,
  overlapsAny,
} from "@/lib/scheduling/slots";
import { addDays, zonedTimeToUtc } from "@/lib/scheduling/time";
import type {
  AdminAppointmentStatusInput,
  AdminRescheduleInput,
  AdminScheduleInput,
  AvailabilityRuleInput,
  BlackoutDateInput,
  BookingInput,
  CustomerRescheduleInput,
} from "@/lib/validators/appointments";

/**
 * Appointments (US-F1, US-F2). Plain Prisma functions; callers pass the db, the clock
 * and the booking config. Every write that claims a time runs in a transaction holding
 * one advisory lock and re-checks for overlaps inside it, so the same time can't be
 * booked twice even by simultaneous requests (US-F1 AC3).
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export interface BookingConfig {
  timeZone: string;
  /** Consultation length (CONSULTATION_MINUTES). */
  durationMinutes: number;
  /** APPOINTMENTS_AUTO_CONFIRM: book straight to CONFIRMED (US-F1 AC2). */
  autoConfirm: boolean;
}

/** Arbitrary constant naming the studio-calendar lock. */
const CALENDAR_LOCK_KEY = 4_202_611;

async function lockCalendar(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CALENDAR_LOCK_KEY})`;
}

const toLocalDate = (d: Date) => d.toISOString().slice(0, 10);
const fromLocalDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Active appointments that end after `from`, optionally ignoring one being moved. */
async function busyIntervals(db: Db | Tx, from: Date, excludeId?: string): Promise<Interval[]> {
  return db.appointment.findMany({
    where: {
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      endsAt: { gt: from },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
}

async function slotOptions(
  db: Db | Tx,
  now: Date,
  config: BookingConfig,
  excludeId?: string,
): Promise<SlotOptions> {
  const [rules, blackouts, busy] = await Promise.all([
    db.availabilityRule.findMany({
      where: { isActive: true },
      select: { weekday: true, startMinute: true, endMinute: true },
    }),
    db.blackoutDate.findMany({
      where: { date: { gte: fromLocalDate(addDays(toLocalDate(now), -1)) } },
      select: { date: true },
    }),
    busyIntervals(db, now, excludeId),
  ]);
  return {
    now,
    timeZone: config.timeZone,
    rules,
    blackoutDates: blackouts.map((b) => toLocalDate(b.date)),
    busy,
    durationMinutes: config.durationMinutes,
    days: BOOKING_WINDOW_DAYS,
    minNoticeMinutes: BOOKING_MIN_NOTICE_HOURS * 60,
  };
}

/** US-F1 AC1: free consultation slots for the next 30 days. */
export async function getAvailableSlots(
  db: Db,
  now: Date,
  config: BookingConfig,
  excludeAppointmentId?: string,
) {
  return generateSlots(await slotOptions(db, now, config, excludeAppointmentId));
}

/** The customer's own custom requests that a consultation can be linked to. */
export async function listLinkableOrders(db: Db, userId: string) {
  return db.customOrder.findMany({
    where: { userId, status: { notIn: [...TERMINAL_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, title: true },
  });
}

export type BookingResult =
  { ok: true; appointmentId: string } | { ok: false; code: "SLOT_UNAVAILABLE" | "ORDER_NOT_FOUND" };

/** US-F1 AC2–AC3: book a consultation in an offered, free slot. */
export async function bookConsultation(
  db: Db,
  userId: string,
  input: BookingInput,
  now: Date,
  config: BookingConfig,
): Promise<BookingResult> {
  if (input.customOrderId) {
    const order = await db.customOrder.findFirst({
      where: { id: input.customOrderId, userId, status: { notIn: [...TERMINAL_STATUSES] } },
      select: { id: true },
    });
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
  }
  return db.$transaction(async (tx): Promise<BookingResult> => {
    await lockCalendar(tx);
    const slot = isOfferedSlot(input.startsAt, await slotOptions(tx, now, config));
    if (!slot) return { ok: false, code: "SLOT_UNAVAILABLE" };
    const appointment = await tx.appointment.create({
      data: {
        userId,
        customOrderId: input.customOrderId ?? null,
        type: "CONSULTATION",
        mode: input.mode,
        status: config.autoConfirm ? "CONFIRMED" : "REQUESTED",
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    return { ok: true, appointmentId: appointment.id };
  });
}

export type CustomerChangeResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "TOO_LATE" | "SLOT_UNAVAILABLE" | "NOT_RESCHEDULABLE" };

/** US-F1 AC5: move my consultation to another offered slot, up to 24 h before. */
export async function rescheduleOwnAppointment(
  db: Db,
  userId: string,
  input: CustomerRescheduleInput,
  now: Date,
  config: BookingConfig,
): Promise<CustomerChangeResult> {
  return db.$transaction(async (tx): Promise<CustomerChangeResult> => {
    await lockCalendar(tx);
    const appt = await tx.appointment.findFirst({
      where: { id: input.appointmentId, userId },
      select: { id: true, status: true, startsAt: true, type: true },
    });
    if (!appt) return { ok: false, code: "NOT_FOUND" };
    if (!canCustomerChange(appt, now)) return { ok: false, code: "TOO_LATE" };
    // Fittings and pickups are arranged by the studio and may differ in length.
    if (appt.type !== "CONSULTATION") return { ok: false, code: "NOT_RESCHEDULABLE" };
    const slot = isOfferedSlot(input.startsAt, await slotOptions(tx, now, config, appt.id));
    if (!slot) return { ok: false, code: "SLOT_UNAVAILABLE" };
    await tx.appointment.update({
      where: { id: appt.id },
      data: {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: config.autoConfirm ? "CONFIRMED" : "REQUESTED",
      },
    });
    return { ok: true };
  });
}

/** US-F1 AC5: cancel my appointment, up to 24 h before. */
export async function cancelOwnAppointment(
  db: Db,
  userId: string,
  appointmentId: string,
  now: Date,
): Promise<CustomerChangeResult> {
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, userId },
    select: { status: true, startsAt: true },
  });
  if (!appt) return { ok: false, code: "NOT_FOUND" };
  if (!canCustomerChange(appt, now)) return { ok: false, code: "TOO_LATE" };
  const { count } = await db.appointment.updateMany({
    where: { id: appointmentId, userId, status: appt.status },
    data: { status: "CANCELLED" },
  });
  return count === 1 ? { ok: true } : { ok: false, code: "TOO_LATE" };
}

export type AdminAppointmentResult =
  | { ok: true; appointmentId: string; status: AppointmentStatus }
  | {
      ok: false;
      code:
        "NOT_FOUND" | "INVALID_TRANSITION" | "NOT_STARTED" | "INVALID_TIME" | "IN_PAST" | "OVERLAP";
      from?: AppointmentStatus;
    };

/** US-F2: confirm, complete, mark no-show or cancel. */
export async function setAppointmentStatus(
  db: Db,
  input: AdminAppointmentStatusInput,
  now: Date,
): Promise<AdminAppointmentResult> {
  const appt = await db.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { status: true, startsAt: true },
  });
  if (!appt) return { ok: false, code: "NOT_FOUND" };
  if (!canTransitionAppointment(appt.status, input.to))
    return { ok: false, code: "INVALID_TRANSITION", from: appt.status };
  if (needsStarted(input.to) && appt.startsAt > now) return { ok: false, code: "NOT_STARTED" };
  const { count } = await db.appointment.updateMany({
    where: { id: input.appointmentId, status: appt.status },
    data: { status: input.to },
  });
  if (count === 0) return { ok: false, code: "INVALID_TRANSITION", from: appt.status };
  return { ok: true, appointmentId: input.appointmentId, status: input.to };
}

/**
 * US-F2: move an active appointment to any free studio-local time, keeping its length
 * and status. Not limited to the weekly hours: the owner decides.
 */
export async function rescheduleAppointment(
  db: Db,
  input: AdminRescheduleInput,
  now: Date,
  config: Pick<BookingConfig, "timeZone">,
): Promise<AdminAppointmentResult> {
  const startsAt = zonedTimeToUtc(input.date, input.time, config.timeZone);
  if (!startsAt) return { ok: false, code: "INVALID_TIME" };
  if (startsAt <= now) return { ok: false, code: "IN_PAST" };
  return db.$transaction(async (tx): Promise<AdminAppointmentResult> => {
    await lockCalendar(tx);
    const appt = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      select: { status: true, startsAt: true, endsAt: true },
    });
    if (!appt) return { ok: false, code: "NOT_FOUND" };
    if (!ACTIVE_APPOINTMENT_STATUSES.some((s) => s === appt.status))
      return { ok: false, code: "INVALID_TRANSITION", from: appt.status };
    const endsAt = new Date(startsAt.getTime() + (appt.endsAt.getTime() - appt.startsAt.getTime()));
    if (overlapsAny({ startsAt, endsAt }, await busyIntervals(tx, now, input.appointmentId)))
      return { ok: false, code: "OVERLAP" };
    await tx.appointment.update({ where: { id: input.appointmentId }, data: { startsAt, endsAt } });
    return { ok: true, appointmentId: input.appointmentId, status: appt.status };
  });
}

/** The owner books a fitting, pickup, measurement or consultation for a custom order (confirmed). */
export async function scheduleAppointment(
  db: Db,
  input: AdminScheduleInput,
  now: Date,
  config: Pick<BookingConfig, "timeZone">,
): Promise<AdminAppointmentResult> {
  const startsAt = zonedTimeToUtc(input.date, input.time, config.timeZone);
  if (!startsAt) return { ok: false, code: "INVALID_TIME" };
  if (startsAt <= now) return { ok: false, code: "IN_PAST" };
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  const order = await db.customOrder.findUnique({
    where: { id: input.customOrderId },
    select: { userId: true },
  });
  if (!order) return { ok: false, code: "NOT_FOUND" };
  return db.$transaction(async (tx): Promise<AdminAppointmentResult> => {
    await lockCalendar(tx);
    if (overlapsAny({ startsAt, endsAt }, await busyIntervals(tx, now)))
      return { ok: false, code: "OVERLAP" };
    const appt = await tx.appointment.create({
      data: {
        userId: order.userId,
        customOrderId: input.customOrderId,
        type: input.type,
        mode: input.mode,
        status: "CONFIRMED",
        startsAt,
        endsAt,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    return { ok: true, appointmentId: appt.id, status: "CONFIRMED" };
  });
}

export async function saveAppointmentNotes(
  db: Db,
  appointmentId: string,
  adminNotes: string | undefined,
): Promise<boolean> {
  const { count } = await db.appointment.updateMany({
    where: { id: appointmentId },
    data: { adminNotes: adminNotes ?? null },
  });
  return count === 1;
}

const listSelect = {
  id: true,
  type: true,
  mode: true,
  status: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  customOrder: { select: { id: true, reference: true, title: true } },
} as const;

/** My appointments (no admin notes), soonest upcoming first, then past newest first. */
export async function listUserAppointments(db: Db, userId: string, now: Date) {
  const all = await db.appointment.findMany({
    where: { userId },
    orderBy: { startsAt: "asc" },
    select: listSelect,
  });
  return {
    upcoming: all.filter((a) => a.endsAt > now && a.status !== "CANCELLED"),
    past: all.filter((a) => !(a.endsAt > now && a.status !== "CANCELLED")).reverse(),
  };
}

export type UserAppointment = Awaited<ReturnType<typeof listUserAppointments>>["upcoming"][number];

export async function getUserAppointment(db: Db, userId: string, appointmentId: string) {
  return db.appointment.findFirst({ where: { id: appointmentId, userId }, select: listSelect });
}

const adminSelect = {
  ...listSelect,
  adminNotes: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, phone: true } },
} as const;

/** Admin calendar: everything overlapping [from, to), any status. */
export async function listAppointmentsBetween(db: Db, from: Date, to: Date) {
  return db.appointment.findMany({
    where: { startsAt: { lt: to }, endsAt: { gt: from } },
    orderBy: { startsAt: "asc" },
    select: adminSelect,
  });
}

/** Admin list: upcoming (soonest first) or past (newest first), optionally one status. */
export async function listAdminAppointments(
  db: Db,
  { scope, status, now }: { scope: "upcoming" | "past"; status?: AppointmentStatus; now: Date },
) {
  return db.appointment.findMany({
    where: {
      ...(scope === "upcoming" ? { endsAt: { gt: now } } : { endsAt: { lte: now } }),
      ...(status ? { status } : {}),
    },
    orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" },
    take: 200,
    select: adminSelect,
  });
}

export type AdminAppointment = Awaited<ReturnType<typeof listAdminAppointments>>[number];

/** Booking requests still waiting for the owner to confirm (dashboard count). */
export async function countPendingRequests(db: Db, now: Date) {
  return db.appointment.count({ where: { status: "REQUESTED", endsAt: { gt: now } } });
}

// ─────────────────────────── Availability (US-F1 DoD) ───────────────────────────

export async function listAvailability(db: Db, now: Date) {
  const [rules, blackouts] = await Promise.all([
    db.availabilityRule.findMany({ orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    db.blackoutDate.findMany({
      where: { date: { gte: fromLocalDate(addDays(toLocalDate(now), -1)) } },
      orderBy: { date: "asc" },
    }),
  ]);
  return {
    rules,
    blackouts: blackouts.map((b) => ({ id: b.id, date: toLocalDate(b.date), reason: b.reason })),
  };
}

export async function addAvailabilityRule(db: Db, input: AvailabilityRuleInput) {
  return db.availabilityRule.create({
    data: { weekday: input.weekday, startMinute: input.start, endMinute: input.end },
    select: { id: true },
  });
}

export async function deleteAvailabilityRule(db: Db, id: string): Promise<boolean> {
  return (await db.availabilityRule.deleteMany({ where: { id } })).count === 1;
}

export type BlackoutResult =
  { ok: true; activeAppointmentsThatDay: number } | { ok: false; code: "DUPLICATE" };

/** Adds a blackout date and reports active appointments already on it (not auto-cancelled). */
export async function addBlackoutDate(
  db: Db,
  input: BlackoutDateInput,
  timeZone: string,
): Promise<BlackoutResult> {
  const exists = await db.blackoutDate.findUnique({ where: { date: fromLocalDate(input.date) } });
  if (exists) return { ok: false, code: "DUPLICATE" };
  await db.blackoutDate.create({
    data: { date: fromLocalDate(input.date), reason: input.reason ?? null },
  });
  const from = zonedTimeToUtc(input.date, 0, timeZone) ?? fromLocalDate(input.date);
  const to =
    zonedTimeToUtc(addDays(input.date, 1), 0, timeZone) ?? fromLocalDate(addDays(input.date, 1));
  const activeAppointmentsThatDay = await db.appointment.count({
    where: {
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      startsAt: { gte: from, lt: to },
    },
  });
  return { ok: true, activeAppointmentsThatDay };
}

export async function deleteBlackoutDate(db: Db, id: string): Promise<boolean> {
  return (await db.blackoutDate.deleteMany({ where: { id } })).count === 1;
}

// ─────────────────────────── Emails ───────────────────────────

export async function getAppointmentEmailData(db: Db, appointmentId: string) {
  return db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      type: true,
      mode: true,
      status: true,
      startsAt: true,
      endsAt: true,
      notes: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
      customOrder: { select: { reference: true, title: true } },
    },
  });
}

export type AppointmentEmailData = NonNullable<Awaited<ReturnType<typeof getAppointmentEmailData>>>;

/** Admin detail view of one appointment. */
export async function getAdminAppointment(db: Db, appointmentId: string) {
  return db.appointment.findUnique({ where: { id: appointmentId }, select: adminSelect });
}

/** Appointments linked to one custom order (admin order page). */
export async function listOrderAppointments(db: Db, customOrderId: string) {
  return db.appointment.findMany({
    where: { customOrderId },
    orderBy: { startsAt: "asc" },
    select: { id: true, type: true, mode: true, status: true, startsAt: true, endsAt: true },
  });
}
