/**
 * Checkout timing rules (US-A4 AC7): a pending purchase holds the piece for 15
 * minutes. After that the hold no longer counts and the order is cancelled.
 */

export const RESERVATION_MINUTES = 15;

/** Pending orders created at or after this instant still hold stock. */
export function reservationCutoff(now: Date, minutes = RESERVATION_MINUTES): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function isReservationActive(
  createdAt: Date,
  now: Date,
  minutes = RESERVATION_MINUTES,
): boolean {
  return createdAt.getTime() >= reservationCutoff(now, minutes).getTime();
}

/** Stock still free to sell: quantity minus active holds. */
export function availableToReserve(quantity: number, activeHolds: number): number {
  return Math.max(0, quantity - activeHolds);
}
