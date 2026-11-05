import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { computeBalance } from "@/lib/custom-order/balance";
import {
  isActiveShipmentStatus,
  mergeTrackingEvents,
  nextShipmentStatus,
} from "@/lib/courier/shipments";
import {
  type CourierAddress,
  CourierError,
  type CourierProvider,
  type Parcel,
  type ShipmentStatusValue,
  type TrackingEvent,
  type TrackingUpdate,
} from "@/lib/courier/types";

import { transitionInTx } from "./admin/orders";
import { markOrderFulfilled } from "./checkout";

/**
 * Courier shipments (v1.2, US-D5). Booking is serialised per order (the order row is
 * locked while the courier is called), so two clicks can't book two couriers. Tracking
 * updates never move a shipment backwards; when one reaches DELIVERED, the shop order is
 * marked fulfilled (starting the repair window) and a custom order is completed.
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

export type ShipmentTarget = { kind: "ORDER" | "CUSTOM_ORDER"; id: string };

export interface ShipmentSettings {
  origin: CourierAddress;
  weightKg: number;
  callbackUrl: string;
}

export interface ShipmentContext {
  /** Why it can't be booked, or null when it can. */
  blocker: string | null;
  destination: CourierAddress | null;
  parcel: Parcel;
  /** The order's reference, shown to the courier. */
  reference: string;
  active: { id: string; status: ShipmentStatusValue; trackingCode: string } | null;
}

const addressSelect = {
  recipientName: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
} as const;

function toCourierAddress(
  a: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
  },
  email: string,
): CourierAddress {
  return {
    name: a.recipientName,
    phone: a.phone,
    email,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    country: "NG",
  };
}

async function activeShipment(db: Db | Tx, target: ShipmentTarget) {
  const shipments = await db.shipment.findMany({
    where: target.kind === "ORDER" ? { orderId: target.id } : { customOrderId: target.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, trackingCode: true },
  });
  return shipments.find((s) => isActiveShipmentStatus(s.status)) ?? null;
}

/** Whether an order can be sent by courier, and what would be sent where. */
export async function getShipmentContext(
  db: Db | Tx,
  target: ShipmentTarget,
  weightKg: number,
): Promise<ShipmentContext | null> {
  const active = await activeShipment(db, target);
  if (target.kind === "ORDER") {
    const order = await db.order.findUnique({
      where: { id: target.id },
      select: {
        status: true,
        fulfillmentMethod: true,
        subtotalKobo: true,
        product: { select: { name: true } },
        user: { select: { email: true } },
        address: { select: addressSelect },
      },
    });
    if (!order) return null;
    const blocker =
      order.fulfillmentMethod !== "DELIVERY"
        ? "This order is for pickup."
        : !order.address
          ? "This order has no delivery address."
          : order.status !== "PAID"
            ? "Only paid orders that haven't been fulfilled can be sent."
            : null;
    return {
      blocker,
      destination: order.address ? toCourierAddress(order.address, order.user.email) : null,
      parcel: { weightKg, valueKobo: order.subtotalKobo, description: order.product.name },
      reference: target.id,
      active,
    };
  }

  const order = await db.customOrder.findUnique({
    where: { id: target.id },
    select: {
      reference: true,
      title: true,
      status: true,
      fulfillmentMethod: true,
      quotedPriceKobo: true,
      depositKobo: true,
      deliveryFeeKobo: true,
      payments: { select: { kind: true, status: true, amountKobo: true } },
      user: { select: { email: true } },
      address: { select: addressSelect },
    },
  });
  if (!order) return null;
  const balance = computeBalance(order, order.payments);
  const blocker =
    order.fulfillmentMethod !== "DELIVERY"
      ? "This order is for pickup."
      : !order.address
        ? "This order has no delivery address."
        : order.status !== "READY"
          ? "Send it once the order is Ready."
          : balance.balanceDueKobo > 0
            ? "The balance must be paid before it's sent."
            : null;
  return {
    blocker,
    destination: order.address ? toCourierAddress(order.address, order.user.email) : null,
    parcel: {
      weightKg,
      valueKobo: order.quotedPriceKobo ?? 0,
      description: order.title,
    },
    reference: order.reference,
    active,
  };
}

/** Prices for sending this order, for the admin to choose from. */
export async function quoteShipment(
  db: Db,
  provider: CourierProvider,
  target: ShipmentTarget,
  settings: Pick<ShipmentSettings, "origin" | "weightKg">,
) {
  const context = await getShipmentContext(db, target, settings.weightKg);
  if (!context || context.blocker || context.active || !context.destination) return [];
  return provider.quote({
    origin: settings.origin,
    destination: context.destination,
    parcel: context.parcel,
  });
}

export type BookShipmentResult =
  | {
      ok: true;
      shipmentId: string;
      trackingCode: string;
      courierName: string;
      providerStatus: string | null;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_ELIGIBLE" | "ALREADY_BOOKED" | "COURIER";
      message: string;
    };

/** Books the courier for an order. Locks the order row so only one booking can win. */
export async function bookShipment(
  db: Db,
  provider: CourierProvider,
  target: ShipmentTarget,
  input: { rateId: string; adminId: string | null; now: Date } & ShipmentSettings,
): Promise<BookShipmentResult> {
  return db.$transaction(
    async (tx) => {
      if (target.kind === "ORDER")
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${target.id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "CustomOrder" WHERE id = ${target.id} FOR UPDATE`;

      const context = await getShipmentContext(tx, target, input.weightKg);
      if (!context) return { ok: false, code: "NOT_FOUND", message: "Order not found." } as const;
      if (context.active)
        return {
          ok: false,
          code: "ALREADY_BOOKED",
          message: `A courier is already booked (tracking ${context.active.trackingCode}).`,
        } as const;
      if (context.blocker || !context.destination)
        return {
          ok: false,
          code: "NOT_ELIGIBLE",
          message: context.blocker ?? "This order can't be sent.",
        } as const;

      let booking;
      try {
        booking = await provider.book({
          origin: input.origin,
          destination: context.destination,
          parcel: context.parcel,
          rateId: input.rateId,
          reference: context.reference,
          callbackUrl: input.callbackUrl,
        });
      } catch (error) {
        if (error instanceof CourierError)
          return { ok: false, code: "COURIER", message: error.message } as const;
        throw error;
      }

      const events: TrackingEvent[] = [
        {
          at: input.now.toISOString(),
          status: booking.status,
          description: `Booked with ${booking.courierName}`,
        },
      ];
      const shipment = await tx.shipment.create({
        data: {
          orderId: target.kind === "ORDER" ? target.id : null,
          customOrderId: target.kind === "CUSTOM_ORDER" ? target.id : null,
          provider: provider.name,
          providerShipmentId: booking.providerShipmentId,
          trackingCode: booking.trackingCode,
          trackingUrl: booking.trackingUrl,
          courierName: booking.courierName,
          feeKobo: booking.feeKobo,
          status: booking.status,
          providerStatus: booking.providerStatus,
          events: events as unknown as Prisma.InputJsonValue,
          bookedById: input.adminId,
          createdAt: input.now,
        },
        select: { id: true },
      });
      return {
        ok: true,
        shipmentId: shipment.id,
        trackingCode: booking.trackingCode,
        courierName: booking.courierName,
        providerStatus: booking.providerStatus,
      } as const;
    },
    // The courier is called inside the transaction; give it time.
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export interface AppliedUpdate {
  shipmentId: string;
  changed: boolean;
  status: ShipmentStatusValue;
  /** True only for the update that first marks it delivered. */
  becameDelivered: boolean;
  orderId: string | null;
  customOrderId: string | null;
}

/** Applies a tracking update; delivered completes the order (once). */
export async function applyTrackingUpdate(
  db: Db,
  shipmentId: string,
  update: Pick<TrackingUpdate, "status" | "events" | "providerStatus">,
  now: Date,
): Promise<AppliedUpdate | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id = ${shipmentId} FOR UPDATE`;
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        status: true,
        events: true,
        providerStatus: true,
        orderId: true,
        customOrderId: true,
      },
    });
    if (!shipment) return null;

    const status = nextShipmentStatus(shipment.status, update.status);
    const before = (shipment.events as unknown as TrackingEvent[]) ?? [];
    const events = mergeTrackingEvents(before, update.events);
    const becameDelivered = status === "DELIVERED" && shipment.status !== "DELIVERED";
    const changed =
      status !== shipment.status ||
      events.length !== before.length ||
      (update.providerStatus ?? null) !== shipment.providerStatus;

    if (changed) {
      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status,
          providerStatus: update.providerStatus ?? shipment.providerStatus,
          events: events as unknown as Prisma.InputJsonValue,
          ...(becameDelivered ? { deliveredAt: now } : {}),
        },
      });
    }

    if (becameDelivered) {
      if (shipment.orderId) await markOrderFulfilled(tx, shipment.orderId, now);
      if (shipment.customOrderId)
        await transitionInTx(tx, {
          orderId: shipment.customOrderId,
          to: "COMPLETED",
          actorId: null,
          note: "Delivered by courier",
          expectedFrom: "READY",
        });
    }

    return {
      shipmentId,
      changed,
      status,
      becameDelivered,
      orderId: shipment.orderId,
      customOrderId: shipment.customOrderId,
    };
  });
}

/** Asks the courier for the latest and applies it. */
export async function refreshShipment(
  db: Db,
  provider: CourierProvider,
  shipmentId: string,
  now: Date,
): Promise<AppliedUpdate | null> {
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { trackingCode: true, provider: true },
  });
  if (!shipment || shipment.provider !== provider.name) return null;
  const update = await provider.track(shipment.trackingCode);
  return applyTrackingUpdate(db, shipmentId, update, now);
}

export interface RefreshRunResult {
  checked: number;
  updated: number;
  failed: number;
  delivered: AppliedUpdate[];
  updates: AppliedUpdate[];
}

/** The polling job: refreshes open shipments, least recently updated first. */
export async function refreshOpenShipments(
  db: Db,
  provider: CourierProvider,
  now: Date,
  limit = 25,
): Promise<RefreshRunResult> {
  const open = await db.shipment.findMany({
    where: { provider: provider.name, status: { notIn: ["DELIVERED", "CANCELLED"] } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const result: RefreshRunResult = {
    checked: 0,
    updated: 0,
    failed: 0,
    delivered: [],
    updates: [],
  };
  for (const { id } of open) {
    result.checked++;
    try {
      const applied = await refreshShipment(db, provider, id, now);
      if (!applied) continue;
      if (applied.changed) {
        result.updated++;
        result.updates.push(applied);
      } else {
        // Touch it so the next run checks others first.
        await db.shipment.update({ where: { id }, data: { updatedAt: now } });
      }
      if (applied.becameDelivered) result.delivered.push(applied);
    } catch (error) {
      result.failed++;
      console.error(`[courier] Couldn't refresh shipment ${id}:`, error);
    }
  }
  return result;
}

/** Admin and customer views: an order's shipments, newest first. */
export async function listShipments(db: Db, target: ShipmentTarget) {
  return db.shipment.findMany({
    where: target.kind === "ORDER" ? { orderId: target.id } : { customOrderId: target.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      trackingCode: true,
      trackingUrl: true,
      courierName: true,
      feeKobo: true,
      status: true,
      providerStatus: true,
      events: true,
      deliveredAt: true,
      createdAt: true,
    },
  });
}

export type ShipmentView = Awaited<ReturnType<typeof listShipments>>[number];

export async function findShipmentByTrackingCode(db: Db, trackingCode: string) {
  return db.shipment.findUnique({ where: { trackingCode }, select: { id: true } });
}

/** Everything a shipping email needs. */
export async function getShipmentEmailData(db: Db, shipmentId: string) {
  const s = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      courierName: true,
      trackingCode: true,
      trackingUrl: true,
      order: {
        select: {
          id: true,
          product: { select: { name: true } },
          user: { select: { email: true, name: true } },
        },
      },
      customOrder: {
        select: {
          id: true,
          title: true,
          reference: true,
          user: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!s) return null;
  const user = s.order?.user ?? s.customOrder?.user;
  if (!user) return null;
  return {
    to: user.email,
    name: user.name,
    itemLabel: s.order
      ? s.order.product.name
      : `${s.customOrder!.title} (${s.customOrder!.reference})`,
    courierName: s.courierName,
    trackingCode: s.trackingCode,
    trackingUrl: s.trackingUrl,
    wardrobePath: s.order ? "/account/wardrobe" : `/account/wardrobe/${s.customOrder!.id}`,
  };
}
