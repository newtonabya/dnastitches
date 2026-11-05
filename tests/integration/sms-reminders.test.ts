import { localDateOf, localMinuteOf } from "@/lib/scheduling/time";
import { updateProfile } from "@/server/data/account";
import { scheduleAppointment } from "@/server/data/appointments";
import { type DueReminder, runDueReminders, syncUserReminders } from "@/server/data/reminders";

import { createTestPrisma, uid } from "./helpers/db";

const mockEnv: Record<string, unknown> = {};
jest.mock("@/lib/env", () => {
  const actual = jest.requireActual("@/lib/env");
  return {
    get env() {
      return { ...actual.env, ...mockEnv };
    },
  };
});
const mockEmailSend = jest.fn();
const mockSmsSend = jest.fn();
jest.mock("@/lib/email", () => ({
  getEmailSender: () => ({ send: (m: unknown) => mockEmailSend(m) }),
}));
jest.mock("@/server/sms", () => ({
  getSmsProvider: () => ({ send: (m: unknown) => mockSmsSend(m) }),
}));

const prisma = createTestPrisma();
const prefix = uid("sms");
const TZ = "Africa/Lagos";
const H = 3600_000;
let texter = "";
let emailOnly = "";
const orders: Record<string, string> = {};
// Own window (1980s–90s), each test earlier than the last: only this file's reminders
// are ever due here (reminders.test.ts uses 2000–2015, other files 2031+).
let cursor = Date.UTC(1980 + Math.floor(Math.random() * 15), 6, 1, 7);
const nextNow = () => new Date((cursor -= 60 * 24 * H));

async function fitting(userId: string, now: Date, hoursAhead = 72) {
  const start = new Date(now.getTime() + hoursAhead * H);
  const r = await scheduleAppointment(
    prisma,
    {
      customOrderId: orders[userId]!,
      type: "FITTING",
      mode: "IN_STUDIO",
      date: localDateOf(start, TZ),
      time: localMinuteOf(start, TZ),
      durationMinutes: 15,
    },
    now,
    { timeZone: TZ },
  );
  if (!r.ok) throw new Error(`setup: ${r.code}`);
  return r.appointmentId;
}

const rows = async (appointmentId: string) =>
  (
    await prisma.reminder.findMany({
      where: { appointmentId },
      orderBy: [{ channel: "asc" }, { offsetMinutes: "desc" }],
    })
  ).map((r) => `${r.channel}:${r.offsetMinutes}`);

beforeAll(async () => {
  texter = (
    await prisma.user.create({
      data: { email: `${prefix}-t@example.com`, phone: "+2348031234567", smsReminders: true },
    })
  ).id;
  emailOnly = (
    await prisma.user.create({
      data: { email: `${prefix}-e@example.com`, phone: "+2348031234568" },
    })
  ).id;
  for (const u of [texter, emailOnly])
    orders[u] = (
      await prisma.customOrder.create({
        data: { reference: `${prefix}-${u}`, userId: u, title: "Gown", description: "x" },
      })
    ).id;
});

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { userId: { in: [texter, emailOnly] } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: [texter, emailOnly] } } });
  await prisma.user.deleteMany({ where: { id: { in: [texter, emailOnly] } } });
  await prisma.$disconnect();
});

describe("planning text reminders (US-G2)", () => {
  it("adds 48 h and 3 h texts only for customers who opted in with a phone", async () => {
    const now = nextNow();
    expect(await rows(await fitting(texter, now))).toEqual([
      "EMAIL:2880",
      "EMAIL:180",
      "SMS:2880",
      "SMS:180",
    ]);
    expect(await rows(await fitting(emailOnly, now, 100))).toEqual(["EMAIL:2880", "EMAIL:180"]);
  });

  it("opting out removes pending texts; opting back in restores them", async () => {
    const now = nextNow();
    const id = await fitting(texter, now);
    await updateProfile(prisma, texter, {
      name: "T",
      phone: "+2348031234567",
      smsReminders: false,
    });
    await syncUserReminders(prisma, texter, now);
    expect(await rows(id)).toEqual(["EMAIL:2880", "EMAIL:180"]);
    await updateProfile(prisma, texter, { name: "T", phone: "+2348031234567", smsReminders: true });
    await syncUserReminders(prisma, texter, now);
    expect(await rows(id)).toEqual(["EMAIL:2880", "EMAIL:180", "SMS:2880", "SMS:180"]);
  });
});

describe("sending text reminders", () => {
  it("sends email and text, each at most once, with the customer's phone", async () => {
    const now = nextNow();
    const id = await fitting(texter, now);
    const runAt = new Date(now.getTime() + 25 * H);
    const delivered: DueReminder[] = [];
    const deliver = async (r: DueReminder) => {
      delivered.push(r);
    };
    const runs = await Promise.all(
      [1, 2].map(() => runDueReminders(prisma, runAt, deliver, 50, { smsEnabled: true })),
    );
    expect(runs.reduce((n, r) => n + r.sent, 0)).toBe(2);
    expect(delivered.map((d) => d.channel).sort()).toEqual(["EMAIL", "SMS"]);
    expect(delivered.find((d) => d.channel === "SMS")!.appointment).toMatchObject({
      id,
      customerPhone: "+2348031234567",
    });
  });

  it("skips texts, with a reason, when SMS isn't set up or the customer turned them off", async () => {
    const now = nextNow();
    const id = await fitting(texter, now);
    const runAt = new Date(now.getTime() + 25 * H);
    const deliver = jest.fn(async () => {});
    expect(await runDueReminders(prisma, runAt, deliver, 50, { smsEnabled: false })).toMatchObject({
      sent: 1,
      skipped: 1,
    });
    const sms = await prisma.reminder.findFirstOrThrow({
      where: { appointmentId: id, channel: "SMS", offsetMinutes: 2880 },
    });
    expect(sms).toMatchObject({
      sentAt: null,
      error: "Skipped: text messages aren't set up (TERMII_API_KEY).",
    });

    // Turned off behind sync's back (e.g. a direct DB edit): skipped at send time.
    await prisma.user.update({ where: { id: texter }, data: { smsReminders: false } });
    const at3h = new Date(now.getTime() + 69 * H);
    expect(await runDueReminders(prisma, at3h, deliver, 50, { smsEnabled: true })).toMatchObject({
      sent: 1,
      skipped: 1,
    });
    expect(
      (
        await prisma.reminder.findFirstOrThrow({
          where: { appointmentId: id, channel: "SMS", offsetMinutes: 180 },
        })
      ).error,
    ).toBe("Skipped: the customer turned off text reminders.");
    await prisma.user.update({ where: { id: texter }, data: { smsReminders: true } });
  });

  it("supersedes per channel: with both overdue, only the 3 h email and the 3 h text go out", async () => {
    const now = nextNow();
    await fitting(texter, now);
    const late = new Date(now.getTime() + 70 * H);
    const delivered: DueReminder[] = [];
    expect(
      await runDueReminders(prisma, late, async (r) => void delivered.push(r), 50, {
        smsEnabled: true,
      }),
    ).toMatchObject({ sent: 2, skipped: 2 });
    expect(delivered.map((d) => `${d.channel}:${d.offsetMinutes}`).sort()).toEqual([
      "EMAIL:180",
      "SMS:180",
    ]);
  });
});

describe("GET /api/cron/reminders", () => {
  it("sends texts through the SMS provider and emails through email", async () => {
    Object.assign(mockEnv, {
      CRON_SECRET: "s3cret",
      STUDIO_TIMEZONE: TZ,
      NEXT_PUBLIC_SITE_URL: "https://dna.example",
    });
    const { GET } = await import("@/app/api/cron/reminders/route");
    // A fitting starting in 2 h from the real clock: its 3 h reminders are due now.
    const now = new Date();
    const start = new Date(now.getTime() + 2 * H);
    const appt = await prisma.appointment.create({
      data: {
        userId: texter,
        customOrderId: orders[texter],
        type: "FITTING",
        status: "CONFIRMED",
        startsAt: start,
        endsAt: new Date(start.getTime() + 15 * 60_000),
      },
    });
    await prisma.reminder.createMany({
      data: (["EMAIL", "SMS"] as const).map((channel) => ({
        appointmentId: appt.id,
        channel,
        offsetMinutes: 180,
        sendAt: new Date(now.getTime() - 60_000),
      })),
    });
    mockEmailSend.mockReset();
    mockSmsSend.mockReset();
    const res = await GET(
      new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer s3cret" } }),
    );
    expect(res.status).toBe(200);
    const smsCalls = mockSmsSend.mock.calls.map((c) => c[0] as { to: string; text: string });
    const mine = smsCalls.filter((c) => c.to === "+2348031234567");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.text).toMatch(
      /^DNA Stitches: reminder of your fitting on .+ \(Lagos time\)\. To change it: https:\/\/dna\.example\/account\/appointments$/,
    );
    expect(
      mockEmailSend.mock.calls.some(
        (c) => (c[0] as { to: string }).to === `${prefix}-t@example.com`,
      ),
    ).toBe(true);
  });
});
