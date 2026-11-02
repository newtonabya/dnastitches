import "server-only";

import { env } from "@/lib/env";
import type { BookingConfig } from "@/server/data/appointments";

/** Booking settings from the environment (US-F1). */
export function bookingConfig(): BookingConfig {
  return {
    timeZone: env.STUDIO_TIMEZONE,
    durationMinutes: env.CONSULTATION_MINUTES,
    autoConfirm: env.APPOINTMENTS_AUTO_CONFIRM,
  };
}
