import {
  APPOINTMENT_TRANSITIONS,
  canCustomerChange,
  canTransitionAppointment,
  isActiveAppointment,
  needsStarted,
} from "@/lib/scheduling/appointments";
import { buildIcs, escapeIcsText, foldIcsLine } from "@/lib/scheduling/ics";
import { generateSlots, isOfferedSlot, isValidRule, overlapsAny } from "@/lib/scheduling/slots";
import {
  addDays,
  formatMinute,
  localDateOf,
  localMinuteOf,
  parseLocalDate,
  parseMinute,
  startOfWeek,
  weekdayOf,
  zoneOffsetMs,
  zonedTimeToUtc,
} from "@/lib/scheduling/time";
import {
  adminRescheduleSchema,
  adminScheduleSchema,
  availabilityRuleSchema,
  blackoutDateSchema,
  bookingSchema,
} from "@/lib/validators/appointments";

const LAGOS = "Africa/Lagos";
const NY = "America/New_York";
const H = 3600_000;

describe("time helpers", () => {
  it("converts studio-local wall times to UTC (Lagos is UTC+1, no DST)", () => {
    expect(zonedTimeToUtc("2026-11-10", 10 * 60, LAGOS)).toEqual(new Date("2026-11-10T09:00:00Z"));
    expect(zoneOffsetMs(new Date("2026-06-01T00:00:00Z"), LAGOS)).toBe(H);
    expect(localDateOf(new Date("2026-11-10T23:30:00Z"), LAGOS)).toBe("2026-11-11");
    expect(localMinuteOf(new Date("2026-11-10T09:15:00Z"), LAGOS)).toBe(10 * 60 + 15);
  });

  it("handles DST: skipped wall times are null, repeated ones resolve to the first", () => {
    // 2026-03-08 02:30 doesn't exist in New York (clocks jump 02:00 → 03:00).
    expect(zonedTimeToUtc("2026-03-08", 2 * 60 + 30, NY)).toBeNull();
    expect(zonedTimeToUtc("2026-03-08", 3 * 60, NY)).toEqual(new Date("2026-03-08T07:00:00Z"));
    // 2026-11-01 01:30 happens twice (EDT then EST): the earlier, EDT, instant wins.
    expect(zonedTimeToUtc("2026-11-01", 90, NY)).toEqual(new Date("2026-11-01T05:30:00Z"));
    expect(zonedTimeToUtc("2026-11-01", 9 * 60, NY)).toEqual(new Date("2026-11-01T14:00:00Z"));
  });

  it("does calendar arithmetic and parsing", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-11-02")).toBe(1); // Monday
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02"); // Sunday → previous Monday
    expect(startOfWeek("2026-11-02")).toBe("2026-11-02");
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("nope")).toBeNull();
    expect(zonedTimeToUtc("2026-02-30", 600, LAGOS)).toBeNull();
    expect(zonedTimeToUtc("2026-02-01", 24 * 60, LAGOS)).toBeNull();
    expect(() => addDays("bad", 1)).toThrow();
    expect(() => weekdayOf("bad")).toThrow();
    expect(parseMinute("09:30")).toBe(570);
    expect(parseMinute("24:00")).toBeNull();
    expect(formatMinute(570)).toBe("09:30");
  });
});

describe("generateSlots (US-F1 AC1)", () => {
  // Monday 2 Nov 2026, 08:00 Lagos.
  const now = new Date("2026-11-02T07:00:00Z");
  const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 10 * 60,
    endMinute: 13 * 60,
  }));
  const base = {
    now,
    timeZone: LAGOS,
    rules: weekdays,
    blackoutDates: [],
    busy: [],
    durationMinutes: 60,
  };

  it("offers back-to-back slots inside each rule, weekdays only, for 30 days", () => {
    const slots = generateSlots(base);
    expect(slots.slice(0, 3).map((s) => s.startsAt.toISOString())).toEqual([
      "2026-11-02T09:00:00.000Z",
      "2026-11-02T10:00:00.000Z",
      "2026-11-02T11:00:00.000Z",
    ]);
    expect(slots.every((s) => ![0, 6].includes(weekdayOf(s.localDate)))).toBe(true);
    expect(slots.at(-1)!.localDate).toBe("2026-12-01"); // day 30 counting today
    expect(slots).toHaveLength(22 * 3);
    expect(generateSlots({ ...base, durationMinutes: 0 })).toEqual([]);
  });

  it("drops blackout dates, busy times and slots inside the notice period", () => {
    const busy = [
      { startsAt: new Date("2026-11-03T09:30:00Z"), endsAt: new Date("2026-11-03T10:30:00Z") },
    ];
    const slots = generateSlots({
      ...base,
      blackoutDates: ["2026-11-04"],
      busy,
      minNoticeMinutes: 24 * 60,
    });
    const days = new Set(slots.map((s) => s.localDate));
    expect(days.has("2026-11-02")).toBe(false); // within 24 h
    expect(days.has("2026-11-04")).toBe(false); // blackout
    const tue = slots
      .filter((s) => s.localDate === "2026-11-03")
      .map((s) => s.startsAt.toISOString());
    // 10:00 (09:00Z) is still too soon (< 24 h); 10:00Z and 11:00Z overlap/clear the busy block.
    expect(tue).toEqual(["2026-11-03T11:00:00.000Z"]);
  });

  it("doesn't let a slot run past the end of its rule, and merges duplicate rules", () => {
    const slots = generateSlots({
      ...base,
      rules: [
        { weekday: 1, startMinute: 600, endMinute: 690 },
        { weekday: 1, startMinute: 600, endMinute: 690 },
      ],
      days: 1,
    });
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(["2026-11-02T09:00:00.000Z"]);
  });

  it("skips the hour lost to DST and keeps local times across the change", () => {
    const slots = generateSlots({
      now: new Date("2026-03-07T12:00:00Z"),
      timeZone: NY,
      rules: [{ weekday: 0, startMinute: 60, endMinute: 4 * 60 }],
      blackoutDates: [],
      busy: [],
      durationMinutes: 60,
      days: 2,
    });
    // Sunday 8 March: 01:00 EST, (02:00 skipped), 03:00 EDT.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-03-08T06:00:00.000Z",
      "2026-03-08T07:00:00.000Z",
    ]);
  });

  it("re-checks a chosen slot server-side", () => {
    expect(isOfferedSlot(new Date("2026-11-02T09:00:00Z"), base)).not.toBeNull();
    expect(isOfferedSlot(new Date("2026-11-02T09:30:00Z"), base)).toBeNull();
    const busy = [
      { startsAt: new Date("2026-11-02T09:00:00Z"), endsAt: new Date("2026-11-02T10:00:00Z") },
    ];
    expect(isOfferedSlot(new Date("2026-11-02T09:00:00Z"), { ...base, busy })).toBeNull();
    expect(overlapsAny(busy[0]!, busy)).toBe(true);
    expect(
      overlapsAny(
        { startsAt: busy[0]!.endsAt, endsAt: new Date(busy[0]!.endsAt.getTime() + H) },
        busy,
      ),
    ).toBe(false);
  });

  it("validates rules", () => {
    expect(isValidRule({ weekday: 1, startMinute: 600, endMinute: 660 })).toBe(true);
    expect(isValidRule({ weekday: 7, startMinute: 600, endMinute: 660 })).toBe(false);
    expect(isValidRule({ weekday: 1, startMinute: 660, endMinute: 600 })).toBe(false);
    expect(isValidRule({ weekday: 1, startMinute: 0, endMinute: 1441 })).toBe(false);
  });
});

describe("appointment rules (US-F1 AC5, US-F2)", () => {
  const now = new Date("2026-11-02T09:00:00Z");
  it("lets customers change active appointments up to 24 h before", () => {
    expect(
      canCustomerChange({ status: "CONFIRMED", startsAt: new Date(now.getTime() + 24 * H) }, now),
    ).toBe(true);
    expect(
      canCustomerChange(
        { status: "REQUESTED", startsAt: new Date(now.getTime() + 24 * H - 1) },
        now,
      ),
    ).toBe(false);
    expect(
      canCustomerChange({ status: "CANCELLED", startsAt: new Date(now.getTime() + 48 * H) }, now),
    ).toBe(false);
  });

  it("allows the admin status moves and nothing out of closed states", () => {
    expect(canTransitionAppointment("REQUESTED", "CONFIRMED")).toBe(true);
    expect(canTransitionAppointment("REQUESTED", "COMPLETED")).toBe(false);
    expect(canTransitionAppointment("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(APPOINTMENT_TRANSITIONS.COMPLETED).toEqual([]);
    expect(isActiveAppointment("REQUESTED")).toBe(true);
    expect(isActiveAppointment("NO_SHOW")).toBe(false);
    expect(needsStarted("COMPLETED")).toBe(true);
    expect(needsStarted("CANCELLED")).toBe(false);
  });
});

describe("buildIcs (US-F1 AC4)", () => {
  it("builds a UTC event with escaping, sequence and method", () => {
    const ics = buildIcs({
      uid: "appt-1@dnastitches",
      start: new Date("2026-11-10T09:00:00Z"),
      end: new Date("2026-11-10T10:00:00Z"),
      summary: "Consultation, DNA Stitches",
      description: "Line one\nLine; two",
      location: "12 Allen Avenue, Ikeja",
      sequence: 3,
      organizer: "studio@example.com",
      stamp: new Date("2026-11-02T00:00:00Z"),
    });
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20261110T090000Z\r\n");
    expect(ics).toContain("DTEND:20261110T100000Z\r\n");
    expect(ics).toContain("SEQUENCE:3\r\n");
    expect(ics).toContain("SUMMARY:Consultation\\, DNA Stitches\r\n");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine\; two\r\n");
    expect(ics).toContain("ORGANIZER:mailto:studio@example.com\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("cancels, and folds long lines at 75 octets", () => {
    const ics = buildIcs({
      uid: "u",
      start: new Date(0),
      end: new Date(H),
      summary: "x",
      method: "CANCEL",
    });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    const folded = foldIcsLine(`DESCRIPTION:${"é".repeat(80)}`);
    for (const line of folded.split("\r\n"))
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((l) => l.startsWith(" ")),
    ).toBe(true);
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
  });
});

describe("appointment validators", () => {
  it("parses a booking and rejects a missing time or mode", () => {
    const ok = bookingSchema.parse({
      startsAt: "2026-11-10T09:00:00.000Z",
      mode: "VIDEO",
      customOrderId: "",
      notes: " ",
    });
    expect(ok).toEqual({ startsAt: new Date("2026-11-10T09:00:00Z"), mode: "VIDEO" });
    const bad = bookingSchema.safeParse({ startsAt: "", mode: "PHONE" });
    expect(bad.error?.issues.map((i) => i.message)).toEqual([
      "Choose a time",
      "Choose in the studio or a video call",
    ]);
  });

  it("parses weekly hours (end may be 24:00) and requires end after start", () => {
    expect(availabilityRuleSchema.parse({ weekday: "2", start: "10:00", end: "24:00" })).toEqual({
      weekday: 2,
      start: 600,
      end: 1440,
    });
    expect(
      availabilityRuleSchema.safeParse({ weekday: "2", start: "12:00", end: "10:00" }).error
        ?.issues[0],
    ).toMatchObject({
      path: ["end"],
      message: "End must be after start",
    });
    expect(
      availabilityRuleSchema.safeParse({ weekday: "9", start: "10:00", end: "11:00" }).success,
    ).toBe(false);
  });

  it("parses blackout dates, admin reschedules and admin scheduling", () => {
    expect(blackoutDateSchema.parse({ date: "2026-12-25", reason: "" })).toEqual({
      date: "2026-12-25",
    });
    expect(blackoutDateSchema.safeParse({ date: "2026-13-01" }).success).toBe(false);
    expect(
      adminRescheduleSchema.parse({ appointmentId: "a", date: "2026-11-10", time: "14:30" }).time,
    ).toBe(870);
    expect(
      adminRescheduleSchema.safeParse({ appointmentId: "a", date: "2026-11-10", time: "2pm" }).error
        ?.issues[0]?.message,
    ).toBe("Enter a time like 14:30");
    const sched = adminScheduleSchema.parse({
      customOrderId: "c",
      type: "FITTING",
      mode: "IN_STUDIO",
      date: "2026-11-10",
      time: "11:00",
      durationMinutes: "45",
    });
    expect(sched.durationMinutes).toBe(45);
    expect(
      adminScheduleSchema.safeParse({
        customOrderId: "c",
        type: "FITTING",
        mode: "IN_STUDIO",
        date: "2026-11-10",
        time: "11:00",
        durationMinutes: "5",
      }).success,
    ).toBe(false);
  });
});
