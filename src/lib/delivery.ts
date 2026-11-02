/**
 * Delivery fee lookup (US-A4 DoD: pure and unit-tested). A zone covers a list of
 * states; the first active zone covering the address's state sets the fee. No match
 * means delivery isn't available there.
 */

export interface DeliveryZoneLike {
  id: string;
  name: string;
  states: readonly string[];
  feeKobo: number;
  etaDays: number;
  isActive: boolean;
}

export type DeliveryFeeResult =
  | { available: true; zoneId: string; zoneName: string; feeKobo: number; etaDays: number }
  | { available: false };

export function resolveDeliveryFee(
  state: string,
  zones: readonly DeliveryZoneLike[],
): DeliveryFeeResult {
  const wanted = state.trim().toLowerCase();
  const zone = zones.find(
    (z) => z.isActive && z.states.some((s) => s.trim().toLowerCase() === wanted),
  );
  return zone
    ? {
        available: true,
        zoneId: zone.id,
        zoneName: zone.name,
        feeKobo: zone.feeKobo,
        etaDays: zone.etaDays,
      }
    : { available: false };
}
