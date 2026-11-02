import type { AppointmentMode, AppointmentStatus, AppointmentType } from "@/generated/prisma/enums";
import type { EmailMessage } from "@/lib/email";
import { APPOINTMENT_MODE_LABELS, APPOINTMENT_TYPE_LABELS } from "@/lib/scheduling/appointments";
import { buildIcs } from "@/lib/scheduling/ics";

/** Appointment emails with an .ics invite (US-F1 AC4, US-F2). Plain text with escaped HTML. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const html = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n");

export type AppointmentEvent = "BOOKED" | "CONFIRMED" | "RESCHEDULED" | "CANCELLED" | "SCHEDULED";

export interface AppointmentEmailInput {
  id: string;
  type: AppointmentType;
  mode: AppointmentMode;
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  updatedAt: Date;
  customerName: string | null;
  customerEmail: string;
  orderLabel: string | null;
  timeZone: string;
  studioAddress: string | null;
  siteUrl: string;
  organizer?: string;
}

/** "Tuesday 10 November 2026, 10:00–11:00 (Lagos time)". */
export function formatAppointmentTime(start: Date, end: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const city = timeZone.split("/").pop()!.replace(/_/g, " ");
  return `${day}, ${time.format(start)}–${time.format(end)} (${city} time)`;
}

function where(d: AppointmentEmailInput): string {
  return d.mode === "VIDEO"
    ? "Video call: we'll email you the link before the appointment."
    : `At the studio${d.studioAddress ? `: ${d.studioAddress}` : ". We'll send you the address."}`;
}

function invite(d: AppointmentEmailInput, method: "REQUEST" | "CANCEL") {
  const title = `${APPOINTMENT_TYPE_LABELS[d.type]}, DNA Stitches`;
  return {
    filename: "appointment.ics",
    contentType: `text/calendar; charset=utf-8; method=${method}`,
    content: buildIcs({
      uid: `${d.id}@dnastitches`,
      start: d.startsAt,
      end: d.endsAt,
      summary: title,
      description: [d.orderLabel ? `For ${d.orderLabel}.` : "", where(d)]
        .filter(Boolean)
        .join("\n"),
      location: d.mode === "VIDEO" ? "Video call" : (d.studioAddress ?? undefined),
      method,
      sequence: Math.floor(d.updatedAt.getTime() / 1000),
      organizer: d.organizer,
    }),
  };
}

const HEADLINES: Record<AppointmentEvent, (type: string, status: AppointmentStatus) => string> = {
  BOOKED: (t, s) =>
    s === "CONFIRMED"
      ? `Your ${t} is booked and confirmed.`
      : `We've received your ${t} request. We'll confirm it shortly.`,
  CONFIRMED: (t) => `Your ${t} is confirmed.`,
  RESCHEDULED: (t, s) =>
    s === "REQUESTED"
      ? `Your ${t} has moved to a new time. We'll confirm it shortly.`
      : `Your ${t} has moved to a new time.`,
  CANCELLED: (t) => `Your ${t} has been cancelled.`,
  SCHEDULED: (t) => `We've booked a ${t} for you.`,
};

const SUBJECTS: Record<AppointmentEvent, string> = {
  BOOKED: "Appointment request received",
  CONFIRMED: "Appointment confirmed",
  RESCHEDULED: "Appointment moved",
  CANCELLED: "Appointment cancelled",
  SCHEDULED: "Appointment booked",
};

export function customerAppointmentEmail(
  event: AppointmentEvent,
  d: AppointmentEmailInput,
): EmailMessage {
  const type = APPOINTMENT_TYPE_LABELS[d.type].toLowerCase();
  const when = formatAppointmentTime(d.startsAt, d.endsAt, d.timeZone);
  const lines = [
    `Hi ${d.customerName ?? "there"},`,
    HEADLINES[event](type, d.status),
    `When: ${when}`,
    ...(event === "CANCELLED" ? [] : [`Where: ${where(d)}`]),
    ...(d.orderLabel ? [`For: ${d.orderLabel}`] : []),
    event === "CANCELLED"
      ? `Book another time: ${d.siteUrl}/custom/book`
      : `You can cancel or move it up to 24 hours before: ${d.siteUrl}/account/appointments`,
    "— DNA Stitches",
  ];
  return {
    to: d.customerEmail,
    subject: `${SUBJECTS[event]}: ${when.split(",").slice(0, 2).join(",")}`,
    text: lines.join("\n\n"),
    html: html(lines),
    attachments: [invite(d, event === "CANCELLED" ? "CANCEL" : "REQUEST")],
  };
}

/** The owner hears about customer bookings, moves and cancellations. */
export function ownerAppointmentEmail(
  to: string[],
  event: Exclude<AppointmentEvent, "CONFIRMED" | "SCHEDULED">,
  d: AppointmentEmailInput,
): EmailMessage {
  const when = formatAppointmentTime(d.startsAt, d.endsAt, d.timeZone);
  const who = d.customerName ?? d.customerEmail;
  const verb = { BOOKED: "booked", RESCHEDULED: "moved", CANCELLED: "cancelled" }[event];
  const lines = [
    `${who} ${verb} a ${APPOINTMENT_TYPE_LABELS[d.type].toLowerCase()} (${APPOINTMENT_MODE_LABELS[d.mode].toLowerCase()}).`,
    `When: ${when}`,
    ...(d.orderLabel ? [`For: ${d.orderLabel}`] : []),
    ...(d.notes ? [`Notes: ${d.notes}`] : []),
    ...(event !== "CANCELLED" && d.status === "REQUESTED"
      ? ["It's waiting for you to confirm."]
      : []),
    `Appointments: ${d.siteUrl}/admin/appointments`,
  ];
  return {
    to,
    subject: `Appointment ${verb}: ${who}`,
    text: lines.join("\n\n"),
    html: html(lines),
    attachments: [invite(d, event === "CANCELLED" ? "CANCEL" : "REQUEST")],
  };
}
