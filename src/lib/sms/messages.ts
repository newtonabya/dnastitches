import type { AppointmentType } from "@/generated/prisma/enums";
import { APPOINTMENT_TYPE_LABELS } from "@/lib/scheduling/appointments";

/** One SMS segment is 160 GSM-7 characters; keep reminders within two. */
export const MAX_SMS_LENGTH = 320;

/**
 * Text reminder for a fitting or pickup (v1.2, US-G2): short, plain ASCII (so it isn't
 * split into Unicode segments), the studio-local day and time, and where to change it.
 */
export function reminderSms(d: {
  type: AppointmentType;
  startsAt: Date;
  timeZone: string;
  siteUrl: string;
}): string {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: d.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(d.startsAt)
    .replace(" at ", ", ");
  const city = d.timeZone.split("/").pop()!.replace(/_/g, " ");
  const text = `DNA Stitches: reminder of your ${APPOINTMENT_TYPE_LABELS[d.type].toLowerCase()} on ${when} (${city} time). To change it: ${d.siteUrl}/account/appointments`;
  return text.length <= MAX_SMS_LENGTH ? text : text.slice(0, MAX_SMS_LENGTH);
}
