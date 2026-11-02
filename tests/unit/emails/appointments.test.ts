import {
  customerAppointmentEmail,
  formatAppointmentTime,
  ownerAppointmentEmail,
} from "@/emails/appointments";

const data = {
  id: "appt1",
  type: "CONSULTATION" as const,
  mode: "IN_STUDIO" as const,
  status: "REQUESTED" as const,
  startsAt: new Date("2026-11-10T09:00:00Z"),
  endsAt: new Date("2026-11-10T10:00:00Z"),
  notes: "Bridal <gown>",
  updatedAt: new Date("2026-11-02T12:00:00Z"),
  customerName: "Ada",
  customerEmail: "ada@example.com",
  orderLabel: "Wedding gown (DNA-2026-0042)",
  timeZone: "Africa/Lagos",
  studioAddress: "12 Allen Avenue, Ikeja",
  siteUrl: "https://dna.example",
};

describe("appointment emails (US-F1 AC4)", () => {
  it("formats times in the studio's zone", () => {
    expect(formatAppointmentTime(data.startsAt, data.endsAt, "Africa/Lagos")).toBe(
      "Tuesday, 10 November 2026, 10:00–11:00 (Lagos time)",
    );
  });

  it("confirms a booking request to the customer with an .ics invite", () => {
    const email = customerAppointmentEmail("BOOKED", data);
    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("Appointment request received: Tuesday, 10 November 2026");
    expect(email.text).toContain("We'll confirm it shortly.");
    expect(email.text).toContain("Where: At the studio: 12 Allen Avenue, Ikeja");
    expect(email.text).toContain("For: Wedding gown (DNA-2026-0042)");
    const [ics] = email.attachments!;
    expect(ics!.filename).toBe("appointment.ics");
    expect(ics!.content).toContain("METHOD:REQUEST");
    expect(ics!.content).toContain("UID:appt1@dnastitches");
    expect(ics!.content).toContain("DTSTART:20261110T090000Z");
  });

  it("sends a CANCEL invite, video wording and auto-confirmed wording", () => {
    const cancelled = customerAppointmentEmail("CANCELLED", { ...data, mode: "VIDEO" });
    expect(cancelled.attachments![0]!.content).toContain("METHOD:CANCEL");
    expect(cancelled.text).toContain("https://dna.example/custom/book");
    expect(cancelled.text).not.toContain("Where:");
    const video = customerAppointmentEmail("CONFIRMED", {
      ...data,
      mode: "VIDEO",
      status: "CONFIRMED",
      customerName: null,
      studioAddress: null,
      orderLabel: null,
    });
    expect(video.text).toContain("Hi there,");
    expect(video.text).toContain("Video call: we'll email you the link");
    expect(customerAppointmentEmail("BOOKED", { ...data, status: "CONFIRMED" }).text).toContain(
      "is booked and confirmed",
    );
    expect(customerAppointmentEmail("RESCHEDULED", data).text).toContain(
      "We'll confirm it shortly",
    );
    expect(
      customerAppointmentEmail("RESCHEDULED", { ...data, status: "CONFIRMED" }).text,
    ).toContain("has moved to a new time.");
    expect(
      customerAppointmentEmail("SCHEDULED", { ...data, type: "FITTING", studioAddress: null }).text,
    ).toContain("We've booked a fitting for you.");
  });

  it("tells the owner who booked, escaping HTML, and that it awaits confirmation", () => {
    const email = ownerAppointmentEmail(["owner@example.com"], "BOOKED", data);
    expect(email.subject).toBe("Appointment booked: Ada");
    expect(email.text).toContain("Ada booked a consultation (in the studio).");
    expect(email.text).toContain("It's waiting for you to confirm.");
    expect(email.html).toContain("Bridal &lt;gown&gt;");
    const cancelled = ownerAppointmentEmail(["o@example.com"], "CANCELLED", {
      ...data,
      notes: null,
      orderLabel: null,
      customerName: null,
    });
    expect(cancelled.subject).toBe("Appointment cancelled: ada@example.com");
    expect(cancelled.text).not.toContain("waiting for you");
  });
});
