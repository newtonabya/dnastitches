import {
  type Booking,
  type BookInput,
  type CourierAddress,
  CourierError,
  type CourierProvider,
  type CourierRate,
  type QuoteInput,
  type ShipmentStatusValue,
  type TrackingEvent,
  type TrackingUpdate,
} from "./types";

/**
 * Sendbox (sendbox.co), behind `CourierProvider`. Built from Sendbox's developer docs
 * (docs.sendbox.co: authentication, request-shipping-quotes, create-new-shipment,
 * track-shipment):
 * - `Authorization: <access token>` header, no "Bearer"; tokens don't expire.
 * - Quotes come back as service tiers (standard / premium / expedited), selected by
 *   `service_code` when creating the shipment, so our rateId is that service code.
 * - Amounts are naira with decimals (the docs' examples); we convert to kobo.
 * - Webhook payloads and signatures aren't documented, so updates are always fetched
 *   from the tracking endpoint rather than trusted from a webhook body (see D-25).
 */

export const SENDBOX_LIVE_URL = "https://live.sendbox.co";

/** Sendbox status codes → ours. Unknown codes return null and are ignored. */
export function mapSendboxStatus(code: string | null | undefined): ShipmentStatusValue | null {
  switch ((code ?? "").trim().toLowerCase()) {
    case "drafted": // booked, but on hold until the Sendbox wallet covers the fee
    case "pending":
    case "pickup_started":
      return "BOOKED";
    case "pickup_completed":
      return "PICKED_UP";
    case "in_transit":
      return "IN_TRANSIT";
    case "in_delivery":
      return "OUT_FOR_DELIVERY";
    case "delivered":
    case "deliverd": // spelt this way in one place in Sendbox's docs
      return "DELIVERED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "failed":
    case "returned":
      return "FAILED";
    default:
      return null;
  }
}

/** Naira (possibly with decimals) → integer kobo. */
export function nairaToKobo(naira: unknown): number | null {
  const n = typeof naira === "string" ? Number(naira) : naira;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** "Up to 8 working days" / "2 - 3 days" → 8 / 3. Null when there's no number. */
export function parseEtaDays(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const numbers = text.match(/\d+/g);
  return numbers ? Math.max(...numbers.map(Number)) : null;
}

function sendboxAddress(a: CourierAddress) {
  const [first, ...rest] = a.name.trim().split(/\s+/);
  return {
    name: a.name,
    first_name: first ?? a.name,
    last_name: rest.join(" ") || first || a.name,
    phone: a.phone,
    email: a.email ?? "",
    street: a.line1,
    street_line_2: a.line2 ?? "",
    city: a.city,
    state: a.state,
    country: a.country,
  };
}

/** The shared quote / shipment body (amounts in naira, as Sendbox expects). */
export function sendboxShipmentBody(input: QuoteInput, pickupDate: string) {
  const value = input.parcel.valueKobo / 100;
  return {
    origin: sendboxAddress(input.origin),
    destination: sendboxAddress(input.destination),
    weight: input.parcel.weightKg,
    incoming_option: "pickup",
    region: "NG",
    service_type: "local",
    package_type: "general",
    total_value: value,
    currency: "NGN",
    channel_code: "api",
    pickup_date: pickupDate,
    items: [
      {
        name: input.parcel.description,
        description: input.parcel.description,
        weight: input.parcel.weightKg,
        quantity: 1,
        value,
      },
    ],
  };
}

interface SendboxRate {
  service_code?: string;
  code?: string;
  name?: string;
  fee?: number | string;
  is_enabled?: boolean;
  sla_description?: string;
  delivery_eta_string?: string;
}

/** Parses a quote response into rates; disabled or unpriced tiers are dropped. */
export function parseSendboxRates(body: unknown): CourierRate[] {
  const rates = (body as { rates?: SendboxRate[] } | null)?.rates;
  if (!Array.isArray(rates)) return [];
  return rates.flatMap((r) => {
    const rateId = r.service_code ?? r.code;
    const feeKobo = nairaToKobo(r.fee);
    if (!rateId || feeKobo === null || feeKobo === 0 || r.is_enabled === false) return [];
    return [
      {
        rateId,
        courierName: `Sendbox ${r.name ?? rateId}`,
        feeKobo,
        etaDays: parseEtaDays(r.sla_description ?? r.delivery_eta_string),
      },
    ];
  });
}

interface SendboxStatus {
  code?: string;
  name?: string;
}

interface SendboxShipment {
  _id?: string;
  id?: string;
  code?: string;
  tracking_code?: string;
  status?: SendboxStatus | string;
  status_code?: string;
  current_status?: SendboxStatus;
  fee?: number | string;
  amount?: number | string;
  courier?: { name?: string } | null;
  events?: {
    status?: SendboxStatus | string;
    status_code?: string;
    description?: string;
    location_description?: string;
    date_created?: string;
  }[];
}

function statusCode(s: SendboxShipment): string | undefined {
  if (s.status_code) return s.status_code;
  if (typeof s.status === "string") return s.status;
  return s.status?.code ?? s.current_status?.code;
}

/** Parses a create-shipment response. */
export function parseSendboxBooking(body: unknown, rate: CourierRate | null): Booking {
  const s = (body ?? {}) as SendboxShipment;
  const providerShipmentId = s._id ?? s.id;
  const trackingCode = s.tracking_code ?? s.code;
  if (!providerShipmentId || !trackingCode)
    throw new CourierError("Sendbox didn't return a shipment id and tracking code.");
  return {
    providerShipmentId: String(providerShipmentId),
    trackingCode: String(trackingCode),
    trackingUrl: null,
    courierName: s.courier?.name ? `Sendbox · ${s.courier.name}` : (rate?.courierName ?? "Sendbox"),
    feeKobo: nairaToKobo(s.fee ?? s.amount) ?? rate?.feeKobo ?? 0,
    status: mapSendboxStatus(statusCode(s)) ?? "BOOKED",
    providerStatus: statusCode(s) ?? null,
  };
}

/** Parses a tracking response; events with unknown statuses are skipped. */
export function parseSendboxTracking(body: unknown, trackingCode: string): TrackingUpdate | null {
  const s = (body ?? {}) as SendboxShipment;
  const status = mapSendboxStatus(statusCode(s));
  const events: TrackingEvent[] = (s.events ?? []).flatMap((e) => {
    const code = e.status_code ?? (typeof e.status === "string" ? e.status : e.status?.code);
    const mapped = mapSendboxStatus(code);
    const at = e.date_created ? new Date(e.date_created) : null;
    if (!mapped || !at || Number.isNaN(at.getTime())) return [];
    const label = typeof e.status === "object" ? e.status?.name : undefined;
    return [
      {
        at: at.toISOString(),
        status: mapped,
        description: [e.description ?? label ?? code, e.location_description]
          .filter(Boolean)
          .join(" · "),
      },
    ];
  });
  const latest = status ?? events.at(-1)?.status ?? null;
  return latest
    ? { trackingCode, status: latest, providerStatus: statusCode(s) ?? null, events }
    : null;
}

/** Tomorrow, as YYYY-MM-DD: the earliest pickup we ask for. */
export function nextPickupDate(now: Date): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
}

export function createSendboxProvider(
  config: { apiKey: string; baseUrl?: string },
  fetchImpl: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
): CourierProvider {
  const base = (config.baseUrl ?? SENDBOX_LIVE_URL).replace(/\/+$/, "");

  async function post(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers: { Authorization: config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new CourierError(
        `Couldn't reach Sendbox: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const json = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      // Sendbox's error text (validation is { field: [msg] }), never our token.
      const detail =
        (json as { description?: string; title?: string } | null)?.description ??
        (json as { title?: string } | null)?.title ??
        (json ? JSON.stringify(json).slice(0, 300) : "no details");
      throw new CourierError(`Sendbox responded ${response.status}: ${detail}`);
    }
    return json;
  }

  return {
    name: "sendbox",
    async quote(input) {
      const body = await post(
        "/shipping/shipment_delivery_quote",
        sendboxShipmentBody(input, nextPickupDate(clock())),
      );
      return parseSendboxRates(body);
    },
    async book(input: BookInput) {
      const body = await post("/shipping/shipments", {
        ...sendboxShipmentBody(input, nextPickupDate(clock())),
        service_code: input.rateId,
        callback_url: input.callbackUrl,
      });
      return parseSendboxBooking(body, null);
    },
    async track(trackingCode) {
      const body = await post("/shipping/tracking", { code: trackingCode });
      const update = parseSendboxTracking(body, trackingCode);
      if (!update) throw new CourierError("Sendbox returned no recognisable tracking status.");
      return update;
    },
  };
}
