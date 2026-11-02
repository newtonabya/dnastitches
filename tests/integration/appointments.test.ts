import {
  addAvailabilityRule,
  addBlackoutDate,
  bookConsultation,
  cancelOwnAppointment,
  getAvailableSlots,
  listUserAppointments,
  rescheduleAppointment,
  rescheduleOwnAppointment,
  scheduleAppointment,
  setAppointmentStatus,
} from "@/server/data/appointments";
import { localDateOf } from "@/lib/scheduling/time";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockAfter = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const prisma = createTestPrisma();
const prefix = uid("appts");
const TZ = "Africa/Lagos";
const config = { timeZone: TZ, durationMinutes: 60, autoConfirm: false };
const H = 3600_000;
const ruleIds: string[] = [];
const blackoutDates: string[] = [];
let ada = "";
let bola = "";
let admin = "";
let orderId = "";
// A far-future week per run, so real bookings never interfere.
const base = new Date(Date.UTC(2031 + Math.floor(Math.random() * 20), 0, 6, 7));
let week = 0;
/** A fresh "now" for each test, a week apart. */
const nextNow = () => new Date(base.getTime() + week++ * 7 * 24 * H);

beforeAll(async () => {
  [ada, bola, admin] = (await Promise.all(
    ["ada", "bola", "admin"].map(
      async (l) =>
        (
          await prisma.user.create({
            data: {
              email: `${prefix}-${l}@example.com`,
              name: l,
              role: l === "admin" ? "ADMIN" : "CUSTOMER",
            },
          })
        ).id,
    ),
  )) as [string, string, string];
  orderId = (
    await prisma.customOrder.create({
      data: { reference: prefix, userId: ada, title: "Gown", description: "x" },
    })
  ).id;
  // Open every day 09:00–12:00 for these tests (plus whatever hours the studio has).
  for (let weekday = 0; weekday < 7; weekday++)
    ruleIds.push((await addAvailabilityRule(prisma, { weekday, start: 9 * 60, end: 12 * 60 })).id);
});

afterAll(async () => {
  const users = [ada, bola, admin];
  await prisma.appointment.deleteMany({ where: { userId: { in: users } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.availabilityRule.deleteMany({ where: { id: { in: ruleIds } } });
  await prisma.blackoutDate.deleteMany({
    where: { date: { in: blackoutDates.map((d) => new Date(`${d}T00:00:00Z`)) } },
  });
  await prisma.$disconnect();
});

describe("booking (US-F1 AC1–AC3)", () => {
  it("offers slots 24 h+ ahead, books one as REQUESTED and stops offering it", async () => {
    const now = nextNow();
    const slots = await getAvailableSlots(prisma, now, config);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.startsAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(24 * H);
    expect(slots.at(-1)!.startsAt.getTime() - now.getTime()).toBeLessThan(31 * 24 * H);

    const result = await bookConsultation(
      prisma,
      ada,
      { startsAt: slots[0]!.startsAt, mode: "VIDEO", customOrderId: orderId, notes: "Bridal" },
      now,
      config,
    );
    expect(result.ok).toBe(true);
    const appt = await prisma.appointment.findUniqueOrThrow({
      where: { id: result.ok ? result.appointmentId : "" },
    });
    expect(appt).toMatchObject({
      status: "REQUESTED",
      type: "CONSULTATION",
      mode: "VIDEO",
      customOrderId: orderId,
      endsAt: new Date(slots[0]!.startsAt.getTime() + H),
    });

    const after = await getAvailableSlots(prisma, now, config);
    expect(after.some((s) => s.startsAt.getTime() === slots[0]!.startsAt.getTime())).toBe(false);
    expect(
      await bookConsultation(
        prisma,
        bola,
        { startsAt: slots[0]!.startsAt, mode: "IN_STUDIO" },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
  });

  it("refuses times that aren't offered and orders that aren't mine; auto-confirm books CONFIRMED", async () => {
    const now = nextNow();
    const [slot] = await getAvailableSlots(prisma, now, config);
    const offGrid = new Date(slot!.startsAt.getTime() + 30 * 60_000);
    expect(
      await bookConsultation(prisma, ada, { startsAt: offGrid, mode: "IN_STUDIO" }, now, config),
    ).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
    expect(
      await bookConsultation(
        prisma,
        bola,
        { startsAt: slot!.startsAt, mode: "IN_STUDIO", customOrderId: orderId },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "ORDER_NOT_FOUND" });
    const r = await bookConsultation(
      prisma,
      bola,
      { startsAt: slot!.startsAt, mode: "IN_STUDIO" },
      now,
      { ...config, autoConfirm: true },
    );
    expect(
      (await prisma.appointment.findUniqueOrThrow({ where: { id: r.ok ? r.appointmentId : "" } }))
        .status,
    ).toBe("CONFIRMED");
  });

  it("two customers racing for the same slot: exactly one gets it (AC3)", async () => {
    const now = nextNow();
    const [slot] = await getAvailableSlots(prisma, now, config);
    const results = await Promise.all(
      [ada, bola, ada, bola].map((user) =>
        bookConsultation(
          prisma,
          user,
          { startsAt: slot!.startsAt, mode: "IN_STUDIO" },
          now,
          config,
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await prisma.appointment.count({
        where: { startsAt: slot!.startsAt, status: { in: ["REQUESTED", "CONFIRMED"] } },
      }),
    ).toBe(1);
  });

  it("blackout dates remove that day's slots and report existing bookings", async () => {
    const now = nextNow();
    const [slot] = await getAvailableSlots(prisma, now, config);
    await bookConsultation(
      prisma,
      ada,
      { startsAt: slot!.startsAt, mode: "IN_STUDIO" },
      now,
      config,
    );
    const day = localDateOf(slot!.startsAt, TZ);
    blackoutDates.push(day);
    expect(await addBlackoutDate(prisma, { date: day, reason: "Holiday" }, TZ)).toEqual({
      ok: true,
      activeAppointmentsThatDay: 1,
    });
    expect(await addBlackoutDate(prisma, { date: day }, TZ)).toEqual({
      ok: false,
      code: "DUPLICATE",
    });
    const slots = await getAvailableSlots(prisma, now, config);
    expect(slots.some((s) => s.localDate === day)).toBe(false);
  });
});

describe("customer changes (US-F1 AC5)", () => {
  async function booked(now: Date, index = 0) {
    const slots = await getAvailableSlots(prisma, now, config);
    const r = await bookConsultation(
      prisma,
      ada,
      { startsAt: slots[index]!.startsAt, mode: "IN_STUDIO" },
      now,
      config,
    );
    if (!r.ok) throw new Error("setup");
    return { id: r.appointmentId, slots };
  }

  it("cancels up to 24 h before; not later, not someone else's", async () => {
    const now = nextNow();
    const { id, slots } = await booked(now);
    const lastMinute = new Date(slots[0]!.startsAt.getTime() - 23 * H);
    expect(await cancelOwnAppointment(prisma, ada, id, lastMinute)).toEqual({
      ok: false,
      code: "TOO_LATE",
    });
    expect(await cancelOwnAppointment(prisma, bola, id, now)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await cancelOwnAppointment(prisma, ada, id, now)).toEqual({ ok: true });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe(
      "CANCELLED",
    );
    // The time is free again.
    expect((await getAvailableSlots(prisma, now, config))[0]!.startsAt).toEqual(slots[0]!.startsAt);
  });

  it("reschedules a consultation to another free slot, back to REQUESTED", async () => {
    const now = nextNow();
    const { id, slots } = await booked(now);
    await setAppointmentStatus(prisma, { appointmentId: id, to: "CONFIRMED" }, now);
    const target = slots[2]!.startsAt;
    expect(
      await rescheduleOwnAppointment(
        prisma,
        ada,
        { appointmentId: id, startsAt: target },
        now,
        config,
      ),
    ).toEqual({ ok: true });
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      startsAt: target,
      status: "REQUESTED",
    });
    expect(
      await rescheduleOwnAppointment(
        prisma,
        bola,
        { appointmentId: id, startsAt: slots[3]!.startsAt },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(
      await rescheduleOwnAppointment(
        prisma,
        ada,
        { appointmentId: id, startsAt: new Date(target.getTime() + 60_000) },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
    const mine = await listUserAppointments(prisma, ada, now);
    expect(mine.upcoming.some((a) => a.id === id)).toBe(true);
    expect(mine.upcoming[0]).not.toHaveProperty("adminNotes");
  });
});

describe("admin (US-F2)", () => {
  it("confirms, refuses completing before the start, completes after", async () => {
    const now = nextNow();
    const [slot] = await getAvailableSlots(prisma, now, config);
    const r = await bookConsultation(
      prisma,
      ada,
      { startsAt: slot!.startsAt, mode: "IN_STUDIO" },
      now,
      config,
    );
    const id = r.ok ? r.appointmentId : "";
    expect(await setAppointmentStatus(prisma, { appointmentId: id, to: "COMPLETED" }, now)).toEqual(
      { ok: false, code: "INVALID_TRANSITION", from: "REQUESTED" },
    );
    expect(
      await setAppointmentStatus(prisma, { appointmentId: id, to: "CONFIRMED" }, now),
    ).toMatchObject({ ok: true, status: "CONFIRMED" });
    expect(await setAppointmentStatus(prisma, { appointmentId: id, to: "NO_SHOW" }, now)).toEqual({
      ok: false,
      code: "NOT_STARTED",
    });
    expect(
      await setAppointmentStatus(
        prisma,
        { appointmentId: id, to: "COMPLETED" },
        new Date(slot!.startsAt.getTime() + 60_000),
      ),
    ).toMatchObject({ ok: true, status: "COMPLETED" });
    expect(
      await setAppointmentStatus(prisma, { appointmentId: "missing", to: "CANCELLED" }, now),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("schedules a fitting for an order and reschedules around overlaps", async () => {
    const now = nextNow();
    const date = localDateOf(new Date(now.getTime() + 3 * 24 * H), TZ);
    const fitting = await scheduleAppointment(
      prisma,
      {
        customOrderId: orderId,
        type: "FITTING",
        mode: "IN_STUDIO",
        date,
        time: 14 * 60,
        durationMinutes: 90,
      },
      now,
      config,
    );
    expect(fitting).toMatchObject({ ok: true, status: "CONFIRMED" });
    const id = fitting.ok ? fitting.appointmentId : "";
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect(appt).toMatchObject({
      userId: ada,
      type: "FITTING",
      startsAt: new Date(`${date}T13:00:00Z`),
      endsAt: new Date(`${date}T14:30:00Z`),
    });

    expect(
      await scheduleAppointment(
        prisma,
        {
          customOrderId: orderId,
          type: "PICKUP",
          mode: "IN_STUDIO",
          date,
          time: 15 * 60,
          durationMinutes: 30,
        },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "OVERLAP" });
    const pickup = await scheduleAppointment(
      prisma,
      {
        customOrderId: orderId,
        type: "PICKUP",
        mode: "IN_STUDIO",
        date,
        time: 16 * 60,
        durationMinutes: 30,
      },
      now,
      config,
    );
    expect(pickup.ok).toBe(true);

    expect(
      await rescheduleAppointment(
        prisma,
        { appointmentId: id, date, time: 15 * 60 + 30 },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "OVERLAP" });
    expect(
      await rescheduleAppointment(
        prisma,
        { appointmentId: id, date: localDateOf(now, TZ), time: 0 },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "IN_PAST" });
    expect(
      await rescheduleAppointment(prisma, { appointmentId: id, date, time: 17 * 60 }, now, config),
    ).toMatchObject({ ok: true, status: "CONFIRMED" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).endsAt).toEqual(
      new Date(`${date}T17:30:00Z`),
    );
    expect(
      await scheduleAppointment(
        prisma,
        {
          customOrderId: "missing",
          type: "PICKUP",
          mode: "IN_STUDIO",
          date,
          time: 600,
          durationMinutes: 30,
        },
        now,
        config,
      ),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("Server Actions", () => {
  const fd = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };

  it("book and cancel as the signed-in customer, emailing each time", async () => {
    const { bookConsultationAction, cancelOwnAppointmentAction } =
      await import("@/server/actions/appointments");
    // The action uses the real clock; book a real slot from the test hours.
    const [slot] = await getAvailableSlots(prisma, new Date(), config);
    mockAuth.mockResolvedValue(null);
    expect(
      await bookConsultationAction(
        null,
        fd({ startsAt: slot!.startsAt.toISOString(), mode: "IN_STUDIO" }),
      ),
    ).toEqual({ ok: false, formError: "Please sign in to book an appointment." });

    mockAuth.mockResolvedValue({ user: { id: bola } });
    expect(await bookConsultationAction(null, fd({ startsAt: "", mode: "IN_STUDIO" }))).toEqual({
      ok: false,
      fieldErrors: { startsAt: "Choose a time" },
    });
    mockAfter.mockClear();
    await expect(
      bookConsultationAction(
        null,
        fd({ startsAt: slot!.startsAt.toISOString(), mode: "IN_STUDIO" }),
      ),
    ).rejects.toMatchObject({ url: "/account/appointments?booked=1" });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    const appt = await prisma.appointment.findFirstOrThrow({
      where: { userId: bola, startsAt: slot!.startsAt, status: "REQUESTED" },
    });

    mockAuth.mockResolvedValue({ user: { id: ada } });
    expect(await cancelOwnAppointmentAction(null, fd({ appointmentId: appt.id }))).toEqual({
      ok: false,
      formError: "We couldn't find that appointment.",
    });
    mockAuth.mockResolvedValue({ user: { id: bola } });
    await expect(
      cancelOwnAppointmentAction(null, fd({ appointmentId: appt.id })),
    ).rejects.toMatchObject({
      url: "/account/appointments?cancelled=1",
    });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe(
      "CANCELLED",
    );
  });

  it("admin actions require an admin and validate input", async () => {
    const actions = await import("@/server/actions/admin/appointments");
    mockAuth.mockResolvedValue({ user: { id: ada } });
    expect(
      await actions.addAvailabilityRuleAction(
        null,
        fd({ weekday: "1", start: "09:00", end: "10:00" }),
      ),
    ).toEqual({ ok: false, formError: "You don't have access to do that." });

    mockAuth.mockResolvedValue({ user: { id: admin } });
    expect(
      await actions.addAvailabilityRuleAction(
        null,
        fd({ weekday: "1", start: "11:00", end: "10:00" }),
      ),
    ).toEqual({ ok: false, fieldErrors: { end: "End must be after start" } });
    expect(
      await actions.addAvailabilityRuleAction(
        null,
        fd({ weekday: "1", start: "20:00", end: "21:00" }),
      ),
    ).toEqual({ ok: true, message: "Hours added." });
    const rule = await prisma.availabilityRule.findFirstOrThrow({
      where: { weekday: 1, startMinute: 1200 },
      orderBy: { createdAt: "desc" },
    });
    expect(await actions.deleteAvailabilityRuleAction(null, fd({ id: rule.id }))).toEqual({
      ok: true,
      message: "Hours removed.",
    });
    expect(await actions.deleteAvailabilityRuleAction(null, fd({ id: rule.id }))).toEqual({
      ok: false,
      formError: "Those hours were already removed.",
    });

    const day = `20${40 + Math.floor(Math.random() * 50)}-06-15`;
    blackoutDates.push(day);
    expect(await actions.addBlackoutDateAction(null, fd({ date: day }))).toEqual({
      ok: true,
      message: "Date blocked.",
    });
    expect(await actions.addBlackoutDateAction(null, fd({ date: day }))).toEqual({
      ok: false,
      fieldErrors: { date: "That date is already blocked" },
    });

    expect(
      await actions.setAppointmentStatusAction(
        null,
        fd({ appointmentId: "missing", to: "CONFIRMED" }),
      ),
    ).toEqual({ ok: false, formError: "That appointment or order no longer exists." });
    expect(
      await actions.rescheduleAppointmentAction(
        null,
        fd({ appointmentId: "x", date: "2026-02-30", time: "10:00" }),
      ),
    ).toEqual({ ok: false, fieldErrors: { date: "Enter a valid date" } });
  });
});
