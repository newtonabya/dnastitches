import { reminderEmail } from "@/emails/reminders";
import {
  MAX_REMINDER_ATTEMPTS,
  decideReminder,
  needsReminders,
  plannedReminders,
} from "@/lib/scheduling/reminders";

const H = 3600_000;
const now = new Date("2026-11-02T09:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * H);

describe("plannedReminders (US-G1 AC1)", () => {
  it("plans 48 h and 3 h reminders for active fittings and pickups", () => {
    const fitting = { type: "FITTING" as const, status: "CONFIRMED" as const, startsAt: at(72) };
    expect(plannedReminders(fitting, now)).toEqual([
      { offsetMinutes: 2880, sendAt: at(24) },
      { offsetMinutes: 180, sendAt: at(69) },
    ]);
    expect(plannedReminders({ ...fitting, type: "PICKUP", status: "REQUESTED" }, now)).toHaveLength(
      2,
    );
  });

  it("drops reminders whose time has passed, and plans none for other types or states", () => {
    expect(
      plannedReminders({ type: "FITTING", status: "CONFIRMED", startsAt: at(30) }, now),
    ).toEqual([{ offsetMinutes: 180, sendAt: at(27) }]);
    expect(plannedReminders({ type: "PICKUP", status: "CONFIRMED", startsAt: at(2) }, now)).toEqual(
      [],
    );
    expect(
      plannedReminders({ type: "CONSULTATION", status: "CONFIRMED", startsAt: at(72) }, now),
    ).toEqual([]);
    expect(
      plannedReminders({ type: "FITTING", status: "CANCELLED", startsAt: at(72) }, now),
    ).toEqual([]);
    expect(needsReminders({ type: "MEASUREMENT", status: "CONFIRMED", startsAt: at(72) })).toBe(
      false,
    );
    expect(MAX_REMINDER_ATTEMPTS).toBe(4); // first try + 3 retries (AC4)
  });
});

describe("decideReminder", () => {
  const appt = { type: "FITTING" as const, status: "CONFIRMED" as const, startsAt: at(2) };
  it("sends the closest due reminder and skips stale or inactive ones", () => {
    expect(decideReminder({ offsetMinutes: 180 }, appt, [2880], now)).toBe("SEND");
    expect(decideReminder({ offsetMinutes: 2880 }, appt, [180], now)).toBe("SKIP_SUPERSEDED");
    expect(decideReminder({ offsetMinutes: 180 }, { ...appt, status: "CANCELLED" }, [], now)).toBe(
      "SKIP_INACTIVE",
    );
    expect(decideReminder({ offsetMinutes: 180 }, { ...appt, startsAt: now }, [], now)).toBe(
      "SKIP_INACTIVE",
    );
  });
});

describe("reminderEmail", () => {
  const base = {
    type: "PICKUP" as const,
    mode: "IN_STUDIO" as const,
    startsAt: new Date("2026-11-10T09:00:00Z"),
    endsAt: new Date("2026-11-10T09:30:00Z"),
    customerName: "Ada",
    customerEmail: "ada@example.com",
    orderLabel: "Wedding gown (DNA-2026-0042)",
    orderId: "o1",
    balanceDueKobo: 100_000_00,
    timeZone: "Africa/Lagos",
    studioAddress: "12 Allen Avenue <Ikeja>",
    siteUrl: "https://dna.example",
  };

  it("reminds about a pickup with the balance due and where to pay", () => {
    const email = reminderEmail(base);
    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("Reminder: your pickup, Tuesday, 10 November 2026");
    expect(email.text).toContain("A reminder about your pickup for Wedding gown (DNA-2026-0042).");
    expect(email.text).toContain("When: Tuesday, 10 November 2026, 10:00–10:30 (Lagos time)");
    expect(email.text).toContain("Balance due before pickup: ₦100,000.00");
    expect(email.text).toContain("https://dna.example/account/wardrobe/o1");
    expect(email.html).toContain("12 Allen Avenue &lt;Ikeja&gt;");
  });

  it("adds fitting advice, and handles video, no order and nothing owed", () => {
    const email = reminderEmail({
      ...base,
      type: "FITTING",
      mode: "VIDEO",
      orderLabel: null,
      orderId: null,
      balanceDueKobo: 0,
      customerName: null,
      studioAddress: null,
    });
    expect(email.text).toContain("Hi there,");
    expect(email.text).toContain("A reminder about your fitting.");
    expect(email.text).toContain("Video call");
    expect(email.text).toContain("shoes and undergarments");
    expect(email.text).not.toContain("Balance due");
    const noOrder = reminderEmail({ ...base, studioAddress: null, orderId: null });
    expect(noOrder.text).toContain("You can pay online: https://dna.example/account/wardrobe\n");
    expect(noOrder.text).toContain("Where: At the studio\n");
  });
});
