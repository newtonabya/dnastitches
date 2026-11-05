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

export interface DeliveryChoice {
  feeKobo: number;
  /** Days, when known. */
  etaDays: number | null;
  /** Shown at checkout: the courier's name, or the zone's. */
  label: string;
  /** Set when a zone's flat fee applies. */
  zoneId: string | null;
  /** Set when a courier's live price applies (Order.deliveryQuotedBy). */
  quotedBy: string | null;
}

/**
 * The delivery price for an address (US-D5): the courier's live price when there is one,
 * otherwise the zone's flat fee; null when neither covers the address.
 */
export function chooseDelivery(
  courier: { feeKobo: number; courierName: string; etaDays: number | null } | null,
  zone: DeliveryFeeResult,
): DeliveryChoice | null {
  if (courier && Number.isInteger(courier.feeKobo) && courier.feeKobo > 0)
    return {
      feeKobo: courier.feeKobo,
      etaDays: courier.etaDays,
      label: courier.courierName,
      zoneId: null,
      quotedBy: courier.courierName,
    };
  if (zone.available)
    return {
      feeKobo: zone.feeKobo,
      etaDays: zone.etaDays,
      label: zone.zoneName,
      zoneId: zone.zoneId,
      quotedBy: null,
    };
  return null;
}
