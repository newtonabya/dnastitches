import { localDateOf, localMinuteOf } from "@/lib/scheduling/time";
import {
  rescheduleAppointment,
  scheduleAppointment,
  setAppointmentStatus,
} from "@/server/data/appointments";
import { type DueReminder, runDueReminders, syncReminders } from "@/server/data/reminders";

import { createTestPrisma, uid } from "./helpers/db";

const mockEnv: Record<string, unknown> = {};
// The real env (DATABASE_URL etc.) with per-test overrides from mockEnv.
jest.mock("@/lib/env", () => {
  const actual = jest.requireActual("@/lib/env");
  return {
    get env() {
      return { ...actual.env, ...mockEnv };
    },
  };
});
const mockSend = jest.fn();
jest.mock("@/lib/email", () => ({ getEmailSender: () => ({ send: (m: unknown) => mockSend(m) }) }));

const prisma = createTestPrisma();
const prefix = uid("reminders");
const TZ = "Africa/Lagos";
const H = 3600_000;
let userId = "";
let orderId = "";
// Each test uses its own moment, earlier than the last, around 2000–2015: only that
// test's reminders are ever due, never other test files' (2031+) or real ones.
let cursor = Date.UTC(2000 + Math.floor(Math.random() * 15), 6, 1, 7);
const nextNow = () => new Date((cursor -= 60 * 24 * H));

async function book(
  now: Date,
  hoursAhead: number,
  type: "FITTING" | "PICKUP" | "CONSULTATION" = "FITTING",
) {
  const start = new Date(now.getTime() + hoursAhead * H);
  const result = await scheduleAppointment(
    prisma,
    {
      customOrderId: orderId,
      type,
      mode: "IN_STUDIO",
      date: localDateOf(start, TZ),
      time: localMinuteOf(start, TZ),
      durationMinutes: 30,
    },
    now,
    { timeZone: TZ },
  );
  if (!result.ok) throw new Error(`setup: ${result.code}`);
  return result.appointmentId;
}

const reminders = (appointmentId: string) =>
  prisma.reminder.findMany({ where: { appointmentId }, orderBy: { offsetMinutes: "desc" } });

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `${prefix}@example.com`, name: "Ada" } })).id;
  orderId = (
    await prisma.customOrder.create({
      data: {
        reference: prefix,
        userId,
        title: "Gown",
        description: "x",
        status: "READY",
        quotedPriceKobo: 200_000_00,
        depositKobo: 100_000_00,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { userId } });
  await prisma.customOrder.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("scheduling reminders (AC1–AC2)", () => {
  it("creates 48 h and 3 h reminders for a fitting, none for a consultation", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    const start = (
      await prisma.appointment.findUniqueOrThrow({ where: { id } })
    ).startsAt.getTime();
    expect((await reminders(id)).map((r) => [r.offsetMinutes, r.sendAt.getTime()])).toEqual([
      [2880, start - 48 * H],
      [180, start - 3 * H],
    ]);
    expect(await reminders(await book(now, 100, "CONSULTATION"))).toEqual([]);
    // Booked 30 h ahead: the 48 h reminder time has passed, so only the 3 h one.
    expect((await reminders(await book(now, 30))).map((r) => r.offsetMinutes)).toEqual([180]);
  });

  it("moves pending reminders on reschedule and re-arms one already sent", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    await prisma.reminder.updateMany({
      where: { appointmentId: id, offsetMinutes: 2880 },
      data: { sentAt: now },
    });
    const newStart = new Date(now.getTime() + 96 * H);
    expect(
      await rescheduleAppointment(
        prisma,
        { appointmentId: id, date: localDateOf(newStart, TZ), time: localMinuteOf(newStart, TZ) },
        now,
        { timeZone: TZ },
      ),
    ).toMatchObject({ ok: true });
    const after = await reminders(id);
    expect(after.map((r) => [r.offsetMinutes, r.sendAt.getTime(), r.sentAt])).toEqual([
      [2880, newStart.getTime() - 48 * H, null],
      [180, newStart.getTime() - 3 * H, null],
    ]);
  });

  it("cancels pending reminders when the appointment is cancelled, keeping sent ones", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    await prisma.reminder.updateMany({
      where: { appointmentId: id, offsetMinutes: 2880 },
      data: { sentAt: now },
    });
    await setAppointmentStatus(prisma, { appointmentId: id, to: "CANCELLED" }, now);
    expect((await reminders(id)).map((r) => r.offsetMinutes)).toEqual([2880]);
    await syncReminders(prisma, "missing", now); // no-op
  });
});

describe("runDueReminders (AC3–AC4)", () => {
  it("sends a due reminder exactly once, even with concurrent and repeated runs", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    const runAt = new Date(now.getTime() + 25 * H); // 48 h reminder due, 3 h not yet
    const delivered: DueReminder[] = [];
    const deliver = async (r: DueReminder) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      delivered.push(r);
    };
    const runs = await Promise.all([1, 2, 3].map(() => runDueReminders(prisma, runAt, deliver)));
    expect(runs.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      offsetMinutes: 2880,
      appointment: {
        id,
        customerEmail: `${prefix}@example.com`,
        orderLabel: `Gown (${prefix})`,
        balanceDueKobo: 200_000_00,
      },
    });
    expect(await runDueReminders(prisma, runAt, deliver)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
      busy: 0,
    });
    const [sent] = await reminders(id);
    expect(sent).toMatchObject({ sentAt: runAt, attempts: 1, lockedUntil: null, error: null });
  });

  it("records failures and retries up to 4 attempts in total", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    const fail = async () => {
      throw new Error("Resend responded 500");
    };
    for (let i = 1; i <= 5; i++) {
      const runAt = new Date(now.getTime() + 25 * H + i * 15 * 60_000);
      await runDueReminders(prisma, runAt, fail);
    }
    const [r] = await reminders(id);
    expect(r).toMatchObject({
      attempts: 4,
      sentAt: null,
      error: "Resend responded 500",
      lockedUntil: null,
    });
    // A later success can't happen: it's given up.
    const ok = jest.fn(async () => {});
    await runDueReminders(prisma, new Date(now.getTime() + 30 * H), ok);
    expect(ok).not.toHaveBeenCalled();
  });

  it("retries after a failure and then succeeds", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    let calls = 0;
    const flaky = async () => {
      if (++calls === 1) throw new Error("timeout");
    };
    const t = (m: number) => new Date(now.getTime() + 25 * H + m * 60_000);
    expect(await runDueReminders(prisma, t(0), flaky)).toMatchObject({ failed: 1 });
    expect(await runDueReminders(prisma, t(15), flaky)).toMatchObject({ sent: 1 });
    expect((await reminders(id))[0]).toMatchObject({ attempts: 2, error: null, sentAt: t(15) });
  });

  it("sends only the closest reminder when both are overdue, and skips inactive appointments", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    const late = new Date(now.getTime() + 70 * H); // both due; start in 2 h
    const deliver = jest.fn(async () => {});
    expect(await runDueReminders(prisma, late, deliver)).toMatchObject({ sent: 1, skipped: 1 });
    const [r48, r3] = await reminders(id);
    expect(r48).toMatchObject({
      sentAt: null,
      error: "Skipped: a closer reminder was due at the same time.",
    });
    expect(r48!.skippedAt).not.toBeNull();
    expect(r3!.sentAt).toEqual(late);

    // Cancelled behind sync's back (e.g. a direct DB edit): skipped at send time.
    const other = await book(nextNow(), 72);
    await prisma.appointment.update({ where: { id: other }, data: { status: "CANCELLED" } });
    const otherStart = (await prisma.appointment.findUniqueOrThrow({ where: { id: other } }))
      .startsAt;
    expect(
      await runDueReminders(prisma, new Date(otherStart.getTime() - 47 * H), deliver),
    ).toMatchObject({ skipped: 1, sent: 0 });
  });

  it("leaves a reminder another runner holds", async () => {
    const now = nextNow();
    const id = await book(now, 72);
    const runAt = new Date(now.getTime() + 25 * H);
    await prisma.reminder.updateMany({
      where: { appointmentId: id },
      data: { lockedUntil: new Date(runAt.getTime() + 5 * 60_000) },
    });
    const deliver = jest.fn(async () => {});
    expect(await runDueReminders(prisma, runAt, deliver)).toMatchObject({ sent: 0 });
    // The lease expired (that runner crashed): picked up.
    expect(
      await runDueReminders(prisma, new Date(runAt.getTime() + 11 * 60_000), deliver),
    ).toMatchObject({ sent: 1 });
  });
});

describe("GET /api/cron/reminders", () => {
  it("requires the cron secret, then runs the job", async () => {
    Object.assign(mockEnv, {
      CRON_SECRET: "s3cret",
      STUDIO_TIMEZONE: TZ,
      STUDIO_ADDRESS: "Studio",
      NEXT_PUBLIC_SITE_URL: "https://dna.example",
    });
    const { GET, POST } = await import("@/app/api/cron/reminders/route");
    expect((await GET(new Request("http://x/api/cron/reminders"))).status).toBe(401);
    expect(
      (
        await GET(
          new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer nope" } }),
        )
      ).status,
    ).toBe(401);
    const res = await POST(
      new Request("http://x/api/cron/reminders", {
        method: "POST",
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({ sent: expect.any(Number), failed: expect.any(Number) }),
    );
    mockEnv.CRON_SECRET = undefined;
    expect(
      (await GET(new Request("http://x", { headers: { authorization: "Bearer undefined" } })))
        .status,
    ).toBe(401);
  });
});
