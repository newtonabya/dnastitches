/**
 * @jest-environment node
 */
import { createDevCourier } from "@/lib/courier/dev";
import { courierWebhookToken, isValidCourierWebhookToken } from "@/lib/courier/webhook-token";

describe("courier webhook token", () => {
  it("is stable per secret and checked in constant time", () => {
    const token = courierWebhookToken("s3cret");
    expect(token).toBe(courierWebhookToken("s3cret"));
    expect(token).not.toBe(courierWebhookToken("other"));
    expect(isValidCourierWebhookToken(token, "s3cret")).toBe(true);
    expect(isValidCourierWebhookToken(token, "other")).toBe(false);
    expect(isValidCourierWebhookToken(`${token}x`, "s3cret")).toBe(false);
    expect(isValidCourierWebhookToken(null, "s3cret")).toBe(false);
  });
});

describe("dev courier", () => {
  const address = {
    name: "A B",
    phone: "+2348000000000",
    line1: "1 Road",
    city: "Ikeja",
    state: "Lagos",
    country: "NG" as const,
  };
  const parcel = { weightKg: 1, valueKobo: 100, description: "Gown" };

  it("prices Lagos lower than elsewhere", async () => {
    const dev = createDevCourier();
    const lagos = await dev.quote({ origin: address, destination: address, parcel });
    const abuja = await dev.quote({
      origin: address,
      destination: { ...address, state: "FCT" },
      parcel,
    });
    expect(lagos[0]!.feeKobo).toBeLessThan(abuja[0]!.feeKobo);
    expect(lagos.map((r) => r.rateId)).toEqual(["standard", "premium"]);
  });

  it("moves a parcel one step every two minutes until delivered", async () => {
    let now = new Date("2026-11-05T10:00:00Z");
    const dev = createDevCourier(() => now);
    const booking = await dev.book({
      origin: address,
      destination: address,
      parcel,
      rateId: "standard",
      reference: "o1",
      callbackUrl: "http://x",
    });
    expect(booking.status).toBe("BOOKED");
    now = new Date(now.getTime() + 5 * 60_000);
    expect((await dev.track(booking.trackingCode)).status).toBe("IN_TRANSIT");
    now = new Date(now.getTime() + 60 * 60_000);
    const done = await dev.track(booking.trackingCode);
    expect(done.status).toBe("DELIVERED");
    expect(done.events.map((e) => e.status)).toEqual([
      "BOOKED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect((await dev.track("not-a-dev-code")).status).toBe("BOOKED");
  });
});
