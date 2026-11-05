/**
 * @jest-environment node
 */
import {
  SENDBOX_LIVE_URL,
  createSendboxProvider,
  mapSendboxStatus,
  nairaToKobo,
  nextPickupDate,
  parseEtaDays,
  parseSendboxBooking,
  parseSendboxRates,
  parseSendboxTracking,
  sendboxShipmentBody,
} from "@/lib/courier/sendbox";
import { CourierError, type QuoteInput } from "@/lib/courier/types";

const input: QuoteInput = {
  origin: {
    name: "DNA Stitches",
    phone: "+2348012345678",
    email: "hello@example.com",
    line1: "12 Admiralty Way",
    city: "Lekki",
    state: "Lagos",
    country: "NG",
  },
  destination: {
    name: "Ada Obi Eze",
    phone: "+2348098765432",
    line1: "4 Aminu Kano Crescent",
    line2: "Flat 2",
    city: "Wuse II",
    state: "FCT",
    country: "NG",
  },
  parcel: { weightKg: 1.5, valueKobo: 15_000_000, description: "Gown" },
};

/** A fake fetch that records requests and replies with the given status and body. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const clock = () => new Date("2026-11-05T12:00:00Z");

describe("mapping helpers", () => {
  it("maps Sendbox statuses, including the docs' typo, and ignores unknown ones", () => {
    expect(mapSendboxStatus("drafted")).toBe("BOOKED");
    expect(mapSendboxStatus("pending")).toBe("BOOKED");
    expect(mapSendboxStatus("pickup_started")).toBe("BOOKED");
    expect(mapSendboxStatus("pickup_completed")).toBe("PICKED_UP");
    expect(mapSendboxStatus("in_transit")).toBe("IN_TRANSIT");
    expect(mapSendboxStatus("in_delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapSendboxStatus("Delivered")).toBe("DELIVERED");
    expect(mapSendboxStatus("deliverd")).toBe("DELIVERED");
    expect(mapSendboxStatus("cancelled")).toBe("CANCELLED");
    expect(mapSendboxStatus("returned")).toBe("FAILED");
    expect(mapSendboxStatus("teleported")).toBeNull();
    expect(mapSendboxStatus(undefined)).toBeNull();
  });

  it("converts naira to kobo and reads ETAs", () => {
    expect(nairaToKobo(30617.0)).toBe(3_061_700);
    expect(nairaToKobo("28180.93")).toBe(2_818_093);
    expect(nairaToKobo(-1)).toBeNull();
    expect(nairaToKobo("abc")).toBeNull();
    expect(parseEtaDays("Up to 8 working days")).toBe(8);
    expect(parseEtaDays("2 - 3 days")).toBe(3);
    expect(parseEtaDays("Soon")).toBeNull();
    expect(parseEtaDays(undefined)).toBeNull();
    expect(nextPickupDate(clock())).toBe("2026-11-06");
  });

  it("builds the documented body, in naira, with split names", () => {
    const body = sendboxShipmentBody(input, "2026-11-06");
    expect(body).toMatchObject({
      weight: 1.5,
      incoming_option: "pickup",
      region: "NG",
      service_type: "local",
      currency: "NGN",
      total_value: 150_000,
      pickup_date: "2026-11-06",
      items: [{ name: "Gown", quantity: 1, value: 150_000, weight: 1.5 }],
    });
    expect(body.destination).toMatchObject({
      first_name: "Ada",
      last_name: "Obi Eze",
      street: "4 Aminu Kano Crescent",
      street_line_2: "Flat 2",
      state: "FCT",
      country: "NG",
    });
    expect(body.origin.last_name).toBe("Stitches");
  });
});

describe("parsing responses", () => {
  it("reads the rate tiers, dropping disabled and unpriced ones", () => {
    expect(
      parseSendboxRates({
        rates: [
          {
            service_code: "standard",
            name: "Standard",
            fee: 30617.0,
            sla_description: "Up to 8 working days",
          },
          { service_code: "premium", name: "Premium", fee: "45000", delivery_eta_string: "2 days" },
          { service_code: "expedited", name: "Expedited", fee: 60000, is_enabled: false },
          { service_code: "free", name: "Free", fee: 0 },
          { name: "No code", fee: 100 },
        ],
      }),
    ).toEqual([
      { rateId: "standard", courierName: "Sendbox Standard", feeKobo: 3_061_700, etaDays: 8 },
      { rateId: "premium", courierName: "Sendbox Premium", feeKobo: 4_500_000, etaDays: 2 },
    ]);
    expect(parseSendboxRates(null)).toEqual([]);
    expect(parseSendboxRates({ rates: "nope" })).toEqual([]);
  });

  it("reads a booking, including one on hold for wallet funds", () => {
    expect(
      parseSendboxBooking(
        {
          _id: "66ba41348f1bd40039f8f38a",
          code: "0002159289",
          status: { code: "drafted", name: "Book on hold" },
          fee: 30617,
          courier: { name: "GIG" },
        },
        null,
      ),
    ).toEqual({
      providerShipmentId: "66ba41348f1bd40039f8f38a",
      trackingCode: "0002159289",
      trackingUrl: null,
      courierName: "Sendbox · GIG",
      feeKobo: 3_061_700,
      status: "BOOKED",
      providerStatus: "drafted",
    });
    expect(() => parseSendboxBooking({ status: "pending" }, null)).toThrow(CourierError);
  });

  it("reads tracking events, skipping unknown or undated ones", () => {
    expect(
      parseSendboxTracking(
        {
          status_code: "in_transit",
          events: [
            {
              status_code: "pending",
              description: "Shipment created",
              date_created: "2026-11-05T10:00:00Z",
            },
            {
              status: { code: "pickup_completed", name: "Pick up completed" },
              location_description: "Lekki",
              date_created: "2026-11-05T15:00:00Z",
            },
            { status_code: "mystery", date_created: "2026-11-05T16:00:00Z" },
            { status_code: "in_transit", date_created: "not a date" },
          ],
        },
        "0002159289",
      ),
    ).toEqual({
      trackingCode: "0002159289",
      status: "IN_TRANSIT",
      providerStatus: "in_transit",
      events: [
        { at: "2026-11-05T10:00:00.000Z", status: "BOOKED", description: "Shipment created" },
        {
          at: "2026-11-05T15:00:00.000Z",
          status: "PICKED_UP",
          description: "Pick up completed · Lekki",
        },
      ],
    });
    expect(parseSendboxTracking({}, "x")).toBeNull();
  });
});

describe("createSendboxProvider", () => {
  it("quotes with the access token in the Authorization header (no Bearer)", async () => {
    const { impl, calls } = fakeFetch(201, {
      rates: [{ service_code: "standard", name: "Standard", fee: 5000 }],
    });
    const provider = createSendboxProvider({ apiKey: "tok_123" }, impl, clock);
    await expect(provider.quote(input)).resolves.toEqual([
      { rateId: "standard", courierName: "Sendbox Standard", feeKobo: 500_000, etaDays: null },
    ]);
    expect(calls[0]!.url).toBe(`${SENDBOX_LIVE_URL}/shipping/shipment_delivery_quote`);
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("tok_123");
    expect(JSON.parse(calls[0]!.init.body as string).pickup_date).toBe("2026-11-06");
  });

  it("books by service code with our callback URL", async () => {
    const { impl, calls } = fakeFetch(201, {
      _id: "s1",
      tracking_code: "T1",
      status_code: "pending",
      fee: 5000,
    });
    const provider = createSendboxProvider(
      { apiKey: "tok", baseUrl: "https://sandbox.example/" },
      impl,
      clock,
    );
    const booking = await provider.book({
      ...input,
      rateId: "premium",
      reference: "order-1",
      callbackUrl: "https://shop.example/api/webhooks/sendbox?token=abc",
    });
    expect(booking).toMatchObject({ trackingCode: "T1", feeKobo: 500_000, status: "BOOKED" });
    expect(calls[0]!.url).toBe("https://sandbox.example/shipping/shipments");
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent).toMatchObject({
      service_code: "premium",
      callback_url: "https://shop.example/api/webhooks/sendbox?token=abc",
    });
    expect(sent).not.toHaveProperty("reference_code");
  });

  it("tracks by code", async () => {
    const { impl, calls } = fakeFetch(201, { status_code: "delivered", events: [] });
    const provider = createSendboxProvider({ apiKey: "tok" }, impl, clock);
    await expect(provider.track("T1")).resolves.toMatchObject({ status: "DELIVERED" });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ code: "T1" });
  });

  it("turns Sendbox errors into CourierError, without the token", async () => {
    const provider = createSendboxProvider(
      { apiKey: "secret_tok" },
      fakeFetch(409, { code: ["Shipment record does not exist"] }).impl,
      clock,
    );
    const error = await provider.track("nope").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CourierError);
    expect((error as Error).message).toMatch(/409.*Shipment record does not exist/);
    expect((error as Error).message).not.toMatch(/secret_tok/);

    const auth = createSendboxProvider(
      { apiKey: "t" },
      fakeFetch(401, { title: "Auth token required", description: "Please provide an auth token" })
        .impl,
      clock,
    );
    await expect(auth.quote(input)).rejects.toThrow(/401: Please provide an auth token/);

    const unrecognised = createSendboxProvider({ apiKey: "t" }, fakeFetch(201, {}).impl, clock);
    await expect(unrecognised.track("T1")).rejects.toThrow(CourierError);
  });

  it("reports a network failure as CourierError", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const provider = createSendboxProvider({ apiKey: "t" }, failing, clock);
    await expect(provider.quote(input)).rejects.toThrow(/Couldn't reach Sendbox: fetch failed/);
  });
});
