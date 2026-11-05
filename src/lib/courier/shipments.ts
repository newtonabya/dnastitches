import type { CourierRate, ShipmentStatusValue, TrackingEvent } from "./types";

/** Customer-facing wording for each shipment state. */
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatusValue, string> = {
  BOOKED: "Courier booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "On the way",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Delivery problem",
};

const ORDER: Record<ShipmentStatusValue, number> = {
  BOOKED: 0,
  PICKED_UP: 1,
  IN_TRANSIT: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  CANCELLED: 4,
  FAILED: 4,
};

/** A shipment that's finished: no more updates expected. */
export function isFinalShipmentStatus(status: ShipmentStatusValue): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
}

/** A shipment that blocks booking another for the same order. */
export function isActiveShipmentStatus(status: ShipmentStatusValue): boolean {
  return status !== "CANCELLED" && status !== "FAILED";
}

/**
 * The status to store after an update. Updates can arrive late or out of order
 * (webhook retries, polling), so a shipment never moves backwards; a final state
 * (delivered, cancelled) is never left, and FAILED can still recover to delivered.
 */
export function nextShipmentStatus(
  current: ShipmentStatusValue,
  incoming: ShipmentStatusValue,
): ShipmentStatusValue {
  if (isFinalShipmentStatus(current)) return current;
  if (current === "FAILED") return incoming === "DELIVERED" ? incoming : current;
  if (incoming === "FAILED" || incoming === "CANCELLED") return incoming;
  return ORDER[incoming] >= ORDER[current] ? incoming : current;
}

/** Adds new tracking events, de-duplicated by time and status, oldest first. */
export function mergeTrackingEvents(
  existing: readonly TrackingEvent[],
  incoming: readonly TrackingEvent[],
): TrackingEvent[] {
  const seen = new Map<string, TrackingEvent>();
  for (const e of [...existing, ...incoming]) seen.set(`${e.at}|${e.status}`, e);
  return [...seen.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** The rate we charge at checkout: the cheapest, ties broken by the quicker one. */
export function cheapestRate(rates: readonly CourierRate[]): CourierRate | null {
  const valid = rates.filter((r) => Number.isInteger(r.feeKobo) && r.feeKobo > 0);
  if (valid.length === 0) return null;
  return [...valid].sort(
    (a, b) => a.feeKobo - b.feeKobo || (a.etaDays ?? Infinity) - (b.etaDays ?? Infinity),
  )[0]!;
}
