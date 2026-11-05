import "server-only";

import { cacheLife } from "next/cache";

import { createDevCourier } from "@/lib/courier/dev";
import { createSendboxProvider } from "@/lib/courier/sendbox";
import { cheapestRate } from "@/lib/courier/shipments";
import type { CourierAddress, CourierProvider } from "@/lib/courier/types";
import { courierWebhookToken } from "@/lib/courier/webhook-token";
import { env } from "@/lib/env";

import type { ShipmentSettings } from "./data/shipments";

/**
 * The configured courier (v1.2, US-D5), or null when none is: then checkout uses the
 * flat delivery-zone fees and booking a courier isn't offered. Sendbox needs
 * SENDBOX_API_KEY; COURIER_DEV=true gives a simulated courier in development only.
 */
export function getCourierProvider(): CourierProvider | null {
  if (env.SENDBOX_API_KEY)
    return createSendboxProvider({ apiKey: env.SENDBOX_API_KEY, baseUrl: env.SENDBOX_BASE_URL });
  if (env.COURIER_DEV && env.NODE_ENV !== "production") return createDevCourier();
  return null;
}

/** Where the courier collects parcels: the studio. */
export function courierOrigin(): CourierAddress {
  return {
    name: "DNA Stitches",
    phone: env.COURIER_ORIGIN_PHONE ?? "+2348000000000",
    email: emailAddress(env.EMAIL_FROM),
    line1: env.COURIER_ORIGIN_STREET ?? "Studio address not set",
    city: env.COURIER_ORIGIN_CITY ?? "Ikeja",
    state: env.COURIER_ORIGIN_STATE ?? "Lagos",
    country: "NG",
  };
}

/** "DNA Stitches <hello@x.com>" → "hello@x.com". */
function emailAddress(from: string | undefined): string | undefined {
  return from?.match(/<([^>]+)>/)?.[1] ?? from;
}

/** Where Sendbox posts updates; the token keeps strangers from triggering refreshes. */
export function courierCallbackUrl(): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/sendbox?token=${courierWebhookToken(env.AUTH_SECRET)}`;
}

export function shipmentSettings(): ShipmentSettings {
  return {
    origin: courierOrigin(),
    weightKg: env.COURIER_PARCEL_WEIGHT_KG,
    callbackUrl: courierCallbackUrl(),
  };
}

export interface DeliveryQuote {
  feeKobo: number;
  courierName: string;
  etaDays: number | null;
}

/**
 * The live delivery price for checkout: the courier's cheapest option to this address.
 * Cached for a few minutes, so the price on the checkout page is the one charged when
 * the customer pays. Returns null when there's no courier, it has no price for this
 * address, or it doesn't answer in time; checkout then falls back to the zone fee.
 */
export async function quoteCheckoutDelivery(
  destination: { city: string; state: string; line1: string },
  valueKobo: number,
  description: string,
): Promise<DeliveryQuote | null> {
  if (!getCourierProvider()) return null;
  return cachedCheckoutQuote(
    destination.city.trim(),
    destination.state.trim(),
    destination.line1.trim(),
    valueKobo,
    description,
  );
}

async function cachedCheckoutQuote(
  city: string,
  state: string,
  line1: string,
  valueKobo: number,
  description: string,
): Promise<DeliveryQuote | null> {
  "use cache";
  cacheLife("minutes");
  const provider = getCourierProvider();
  if (!provider) return null;
  try {
    const rates = await withTimeout(
      provider.quote({
        origin: courierOrigin(),
        // The price depends on where it's going, not who receives it.
        destination: {
          name: "DNA Stitches customer",
          phone: courierOrigin().phone,
          line1,
          city,
          state,
          country: "NG",
        },
        parcel: { weightKg: env.COURIER_PARCEL_WEIGHT_KG, valueKobo, description },
      }),
      8_000,
    );
    const best = cheapestRate(rates);
    return best
      ? { feeKobo: best.feeKobo, courierName: best.courierName, etaDays: best.etaDays }
      : null;
  } catch (error) {
    console.error("[courier] Checkout quote failed; using the zone fee:", error);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms),
    ),
  ]);
}
