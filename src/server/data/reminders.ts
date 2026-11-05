import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ReminderChannel } from "@/generated/prisma/enums";
import { computeBalance } from "@/lib/custom-order/balance";
import {
  MAX_REMINDER_ATTEMPTS,
  REMINDER_LEASE_MINUTES,
  decideReminder,
  plannedReminders,
  wantsTextReminders,
} from "@/lib/scheduling/reminders";

/**
 * Fitting and pickup reminders (US-G1), by email and, for customers who opted in, by
 * text (SMS/WhatsApp, v1.2 US-G2). `syncReminders` keeps an appointment's reminders in
 * step with its time, status and the customer's opt-in (AC1–AC2); `runDueReminders` is
 * the job the cron endpoint runs (AC3–AC4).
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/**
 * Creates, moves or removes an appointment's unsent reminders to match its current
 * time and status. Sent reminders are kept as history, unless the appointment moved:
 * then the reminder is re-armed for the new time.
 */
export async function syncReminders(db: Db | Tx, appointmentId: string, now: Date) {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      type: true,
      status: true,
      startsAt: true,
      user: { select: { smsReminders: true, phone: true } },
    },
  });
  const channels: ReminderChannel[] = appointment
    ? ["EMAIL", ...(wantsTextReminders(appointment.user) ? (["SMS"] as const) : [])]
    : [];
  const planned = appointment
    ? channels.flatMap((channel) =>
        plannedReminders(appointment, now).map((p) => ({ ...p, channel })),
      )
    : [];
  const existing = await db.reminder.findMany({ where: { appointmentId } });

  // Unsent reminders that are no longer wanted (cancelled, done, now in the past, or
  // texts the customer turned off).
  const key = (r: { channel: ReminderChannel; offsetMinutes: number }) =>
    `${r.channel}:${r.offsetMinutes}`;
  const keep = new Set(planned.map(key));
  const unwanted = existing.filter((r) => r.sentAt === null && !keep.has(key(r)));
  if (unwanted.length > 0)
    await db.reminder.deleteMany({ where: { id: { in: unwanted.map((r) => r.id) } } });

  for (const p of planned) {
    const row = existing.find((r) => key(r) === key(p));
    if (!row) {
      await db.reminder.create({
        data: {
          appointmentId,
          channel: p.channel,
          offsetMinutes: p.offsetMinutes,
          sendAt: p.sendAt,
        },
      });
    } else if (row.sendAt.getTime() !== p.sendAt.getTime()) {
      // Moved: re-arm for the new time, even if the old one was already sent.
      await db.reminder.update({
        where: { id: row.id },
        data: {
          sendAt: p.sendAt,
          sentAt: null,
          skippedAt: null,
          attempts: 0,
          lockedUntil: null,
          error: null,
        },
      });
    }
  }
}

/** A customer changed their text opt-in or phone: re-sync their upcoming appointments. */
export async function syncUserReminders(db: Db, userId: string, now: Date) {
  const upcoming = await db.appointment.findMany({
    where: { userId, status: { in: ["REQUESTED", "CONFIRMED"] }, startsAt: { gt: now } },
    select: { id: true },
  });
  for (const a of upcoming) await syncReminders(db, a.id, now);
}

/** Everything a reminder email or text needs. */
export interface DueReminder {
  reminderId: string;
  channel: ReminderChannel;
  offsetMinutes: number;
  appointment: {
    id: string;
    type: "CONSULTATION" | "MEASUREMENT" | "FITTING" | "PICKUP";
    mode: "IN_STUDIO" | "VIDEO";
    startsAt: Date;
    endsAt: Date;
    customerName: string | null;
    customerEmail: string;
    /** E.164; set for text reminders. */
    customerPhone: string | null;
    orderLabel: string | null;
    orderId: string | null;
    /** For pickups: what's still owed on the custom order, if anything. */
    balanceDueKobo: number;
  };
}

export interface RunResult {
  sent: number;
  failed: number;
  skipped: number;
  /** Reminders another runner held, left for it. */
  busy: number;
}

/**
 * Sends every due reminder at most once (AC3). Each one is claimed with a conditional
 * update before sending, so concurrent or repeated runs can't send it twice. Failures
 * are recorded on the row and retried on later runs, up to MAX_REMINDER_ATTEMPTS (AC4).
 * `deliver` must throw when sending fails. Text reminders are skipped, with a reason,
 * when `smsEnabled` is false (no provider configured).
 */
export async function runDueReminders(
  db: Db,
  now: Date,
  deliver: (reminder: DueReminder) => Promise<void>,
  limit = 50,
  { smsEnabled = false }: { smsEnabled?: boolean } = {},
): Promise<RunResult> {
  const result: RunResult = { sent: 0, failed: 0, skipped: 0, busy: 0 };
  const due = await db.reminder.findMany({
    where: {
      sentAt: null,
      skippedAt: null,
      sendAt: { lte: now },
      attempts: { lt: MAX_REMINDER_ATTEMPTS },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    orderBy: { sendAt: "asc" },
    take: limit,
    select: { id: true, appointmentId: true, channel: true, offsetMinutes: true },
  });

  for (const reminder of due) {
    const claimed = await db.reminder.updateMany({
      where: {
        id: reminder.id,
        sentAt: null,
        skippedAt: null,
        attempts: { lt: MAX_REMINDER_ATTEMPTS },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil: new Date(now.getTime() + REMINDER_LEASE_MINUTES * 60_000) },
    });
    if (claimed.count === 0) {
      result.busy++;
      continue;
    }

    const appointment = await db.appointment.findUnique({
      where: { id: reminder.appointmentId },
      select: {
        id: true,
        type: true,
        mode: true,
        status: true,
        startsAt: true,
        endsAt: true,
        user: { select: { name: true, email: true, phone: true, smsReminders: true } },
        customOrder: {
          select: {
            id: true,
            reference: true,
            title: true,
            quotedPriceKobo: true,
            depositKobo: true,
            deliveryFeeKobo: true,
            payments: {
              where: { status: "SUCCESS" },
              select: { kind: true, amountKobo: true, status: true },
            },
          },
        },
        reminders: {
          // Same channel only: an overdue email doesn't supersede a text, or vice versa.
          where: {
            sentAt: null,
            skippedAt: null,
            sendAt: { lte: now },
            channel: reminder.channel,
            id: { not: reminder.id },
          },
          select: { offsetMinutes: true },
        },
      },
    });

    const timing = appointment
      ? decideReminder(
          reminder,
          appointment,
          appointment.reminders.map((r) => r.offsetMinutes),
          now,
        )
      : "SKIP_INACTIVE";
    const decision =
      timing === "SEND" && reminder.channel === "SMS"
        ? !wantsTextReminders(appointment!.user)
          ? "SKIP_NO_TEXTS"
          : !smsEnabled
            ? "SKIP_SMS_OFF"
            : "SEND"
        : timing;
    if (!appointment || decision !== "SEND") {
      await db.reminder.update({
        where: { id: reminder.id },
        data: {
          skippedAt: now,
          lockedUntil: null,
          error: {
            SKIP_SUPERSEDED: "Skipped: a closer reminder was due at the same time.",
            SKIP_INACTIVE: "Skipped: the appointment is no longer upcoming.",
            SKIP_NO_TEXTS: "Skipped: the customer turned off text reminders.",
            SKIP_SMS_OFF: "Skipped: text messages aren't set up (TERMII_API_KEY).",
          }[decision as Exclude<typeof decision, "SEND">],
        },
      });
      result.skipped++;
      continue;
    }

    const order = appointment.customOrder;
    const balance =
      order && order.quotedPriceKobo !== null ? computeBalance(order, order.payments) : null;
    try {
      await deliver({
        reminderId: reminder.id,
        channel: reminder.channel,
        offsetMinutes: reminder.offsetMinutes,
        appointment: {
          id: appointment.id,
          type: appointment.type,
          mode: appointment.mode,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          customerName: appointment.user.name,
          customerEmail: appointment.user.email,
          customerPhone: appointment.user.phone,
          orderLabel: order ? `${order.title} (${order.reference})` : null,
          orderId: order?.id ?? null,
          balanceDueKobo: Math.max(0, balance?.balanceDueKobo ?? 0),
        },
      });
      await db.reminder.update({
        where: { id: reminder.id },
        data: { sentAt: now, lockedUntil: null, attempts: { increment: 1 }, error: null },
      });
      result.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.reminder.update({
        where: { id: reminder.id },
        data: {
          lockedUntil: null,
          attempts: { increment: 1 },
          error: message.slice(0, 500),
        },
      });
      result.failed++;
    }
  }
  return result;
}

/** Admin appointment page: the reminders and their state. */
export async function listAppointmentReminders(db: Db, appointmentId: string) {
  return db.reminder.findMany({
    where: { appointmentId },
    orderBy: [{ sendAt: "asc" }, { channel: "asc" }],
    select: {
      id: true,
      channel: true,
      offsetMinutes: true,
      sendAt: true,
      sentAt: true,
      skippedAt: true,
      attempts: true,
      error: true,
    },
  });
}
