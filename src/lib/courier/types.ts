/**
 * Courier abstraction (v1.2, US-D5): live delivery prices at checkout, booking a pickup
 * for a paid order, and tracking. Sendbox is the first provider; the interface keeps
 * room for another. Amounts are integer kobo, like everywhere else (D-8).
 */

/** Our shipment states. Each provider maps its own status names onto these. */
export const SHIPMENT_STATUSES = [
  "BOOKED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
] as const;
export type ShipmentStatusValue = (typeof SHIPMENT_STATUSES)[number];

export interface CourierAddress {
  name: string;
  phone: string; // E.164
  email?: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  country: "NG";
}

export interface Parcel {
  weightKg: number;
  /** Declared value, for insurance. */
  valueKobo: number;
  description: string;
}

export interface QuoteInput {
  origin: CourierAddress;
  destination: CourierAddress;
  parcel: Parcel;
}

export interface CourierRate {
  /** Provider's id for this option, passed back when booking. */
  rateId: string;
  courierName: string;
  feeKobo: number;
  /** Estimated delivery time in days, when the provider gives one. */
  etaDays: number | null;
}

export interface BookInput extends QuoteInput {
  rateId: string;
  /** Our reference (the order's), echoed back by the provider where supported. */
  reference: string;
  /** Where the provider should send status updates. */
  callbackUrl: string;
}

export interface Booking {
  providerShipmentId: string;
  trackingCode: string;
  trackingUrl: string | null;
  courierName: string;
  feeKobo: number;
  status: ShipmentStatusValue;
  /** The provider's own status code, shown to the admin (e.g. Sendbox "drafted"). */
  providerStatus: string | null;
}

export interface TrackingEvent {
  at: string; // ISO
  status: ShipmentStatusValue;
  description: string;
}

export interface TrackingUpdate {
  trackingCode: string;
  status: ShipmentStatusValue;
  providerStatus: string | null;
  events: TrackingEvent[];
}

export interface CourierProvider {
  readonly name: "sendbox" | "dev";
  quote(input: QuoteInput): Promise<CourierRate[]>;
  book(input: BookInput): Promise<Booking>;
  track(trackingCode: string): Promise<TrackingUpdate>;
}

export class CourierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourierError";
  }
}
