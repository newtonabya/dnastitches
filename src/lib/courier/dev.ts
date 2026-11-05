import { nextShipmentStatus } from "./shipments";
import type { CourierProvider, ShipmentStatusValue, TrackingEvent } from "./types";

/**
 * A simulated courier for local development (COURIER_DEV=true, never in production):
 * prices like a real quote, and a booked parcel moves one step along every two minutes,
 * so booking, tracking and the delivered → fulfilled hand-off can be tried end to end.
 */

const STEPS: ShipmentStatusValue[] = [
  "BOOKED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
const STEP_MS = 2 * 60_000;

export function createDevCourier(clock: () => Date = () => new Date()): CourierProvider {
  return {
    name: "dev",
    async quote({ destination }) {
      const local = destination.state.trim().toLowerCase() === "lagos";
      const base = local ? 300_000 : 650_000;
      return [
        {
          rateId: "standard",
          courierName: "Dev courier Standard",
          feeKobo: base,
          etaDays: local ? 2 : 5,
        },
        {
          rateId: "premium",
          courierName: "Dev courier Premium",
          feeKobo: base * 2,
          etaDays: local ? 1 : 3,
        },
      ];
    },
    async book({ rateId }) {
      const bookedAt = clock().getTime();
      return {
        providerShipmentId: `dev-${bookedAt}`,
        trackingCode: `DEV-${bookedAt}`,
        trackingUrl: null,
        courierName: rateId === "premium" ? "Dev courier Premium" : "Dev courier Standard",
        feeKobo: rateId === "premium" ? 600_000 : 300_000,
        status: "BOOKED",
        providerStatus: "pending",
      };
    },
    async track(trackingCode) {
      const parsed = Number(trackingCode.replace(/^DEV-/, ""));
      // An unrecognised code is treated as just booked.
      const bookedAt = Number.isFinite(parsed) ? parsed : clock().getTime();
      const steps = Math.min(
        STEPS.length - 1,
        Math.max(0, Math.floor((clock().getTime() - bookedAt) / STEP_MS)),
      );
      const events: TrackingEvent[] = STEPS.slice(0, steps + 1).map((status, i) => ({
        at: new Date(bookedAt + i * STEP_MS).toISOString(),
        status,
        description: `Simulated: ${status.toLowerCase().replaceAll("_", " ")}`,
      }));
      const status = events.reduce<ShipmentStatusValue>(
        (s, e) => nextShipmentStatus(s, e.status),
        "BOOKED",
      );
      return { trackingCode, status, providerStatus: status.toLowerCase(), events };
    },
  };
}
