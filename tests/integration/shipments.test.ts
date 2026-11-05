import { CourierError, type CourierProvider } from "@/lib/courier/types";
import { reserveRtwOrder } from "@/server/data/checkout";
import {
  applyTrackingUpdate,
  bookShipment,
  getShipmentContext,
  listShipments,
  quoteShipment,
  refreshOpenShipments,
} from "@/server/data/shipments";

import { createTestPrisma, uid } from "./helpers/db";

const prisma = createTestPrisma();
const prefix = uid("ship");
let seq = 0;
const now = new Date("2026-11-05T10:00:00Z");

const settings = {
  origin: {
    name: "DNA Stitches",
    phone: "+2348012345678",
    line1: "Studio",
    city: "Ikeja",
    state: "Lagos",
    country: "NG" as const,
  },
  weightKg: 1,
  callbackUrl: "https://shop.example/api/webhooks/sendbox?token=t",
};

/** A scripted courier: records calls, books with sequential codes, tracks from a map. */
function fakeCourier(opts: { failBooking?: boolean; delayMs?: number } = {}) {
  const booked: string[] = [];
  const statuses = new Map<string, "BOOKED" | "IN_TRANSIT" | "DELIVERED">();
  const provider: CourierProvider = {
    name: "dev",
    async quote() {
      return [
        { rateId: "standard", courierName: "Fake Standard", feeKobo: 300_000, etaDays: 3 },
        { rateId: "premium", courierName: "Fake Premium", feeKobo: 600_000, etaDays: 1 },
      ];
    },
    async book({ rateId, reference }) {
      if (opts.failBooking) throw new CourierError("Sendbox responded 409: bad address");
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const code = `${prefix}-T${++seq}`;
      booked.push(reference);
      statuses.set(code, "BOOKED");
      return {
        providerShipmentId: `p-${code}`,
        trackingCode: code,
        trackingUrl: null,
        courierName: rateId === "premium" ? "Fake Premium" : "Fake Standard",
        feeKobo: rateId === "premium" ? 600_000 : 300_000,
        status: "BOOKED",
        providerStatus: "pending",
      };
    },
    async track(code) {
      const status = statuses.get(code) ?? "BOOKED";
      return {
        trackingCode: code,
        status,
        providerStatus: status.toLowerCase(),
        events: [{ at: "2026-11-05T12:00:00.000Z", status, description: `Now ${status}` }],
      };
    },
  };
  return { provider, booked, statuses };
}

let user = "";
let address = "";

async function product() {
  return prisma.product.create({
    data: {
      slug: `${prefix}-p${++seq}`,
      name: `Piece ${seq}`,
      description: "x",
      priceKobo: 5_000_000,
      quantity: 1,
      inventoryStatus: "AVAILABLE",
      fabricComposition: "x",
      careInstructions: "x",
      isPublished: true,
    },
  });
}

async function paidOrder(method: "DELIVERY" | "PICKUP" = "DELIVERY", status = "PAID" as const) {
  const p = await product();
  return prisma.order.create({
    data: {
      userId: user,
      productId: p.id,
      subtotalKobo: p.priceKobo,
      deliveryFeeKobo: method === "DELIVERY" ? 300_000 : 0,
      totalKobo: p.priceKobo + (method === "DELIVERY" ? 300_000 : 0),
      status,
      fulfillmentMethod: method,
      addressId: method === "DELIVERY" ? address : null,
      finalSaleAcknowledgedAt: now,
    },
  });
}

async function readyCustomOrder(balancePaid: boolean) {
  const order = await prisma.customOrder.create({
    data: {
      reference: `${prefix}-c${++seq}`,
      userId: user,
      title: "Gown",
      description: "x",
      status: "READY",
      quotedPriceKobo: 10_000_000,
      depositKobo: 5_000_000,
      deliveryFeeKobo: 400_000,
      fulfillmentMethod: "DELIVERY",
      addressId: address,
    },
  });
  await prisma.payment.create({
    data: {
      userId: user,
      kind: "CUSTOM_DEPOSIT",
      channel: "OFFLINE",
      status: "SUCCESS",
      amountKobo: 5_000_000,
      customOrderId: order.id,
      paidAt: now,
    },
  });
  if (balancePaid)
    await prisma.payment.create({
      data: {
        userId: user,
        kind: "CUSTOM_BALANCE",
        channel: "OFFLINE",
        status: "SUCCESS",
        amountKobo: 5_400_000,
        customOrderId: order.id,
        paidAt: now,
      },
    });
  return order;
}

beforeAll(async () => {
  user = (await prisma.user.create({ data: { email: `${prefix}@example.com`, name: "Ada Obi" } }))
    .id;
  address = (
    await prisma.address.create({
      data: {
        userId: user,
        recipientName: "Ada Obi",
        phone: "+2348098765432",
        line1: "4 Aminu Kano Crescent",
        city: "Wuse II",
        state: "FCT",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("eligibility", () => {
  it("allows paid delivery orders and fully paid ready custom orders only", async () => {
    const ok = await paidOrder();
    const pickup = await paidOrder("PICKUP");
    const unpaid = await readyCustomOrder(false);
    const paid = await readyCustomOrder(true);
    const ctx = (kind: "ORDER" | "CUSTOM_ORDER", id: string) =>
      getShipmentContext(prisma, { kind, id }, 1);

    expect((await ctx("ORDER", ok.id))?.blocker).toBeNull();
    expect((await ctx("ORDER", ok.id))?.destination).toMatchObject({
      state: "FCT",
      email: `${prefix}@example.com`,
    });
    expect((await ctx("ORDER", pickup.id))?.blocker).toMatch(/pickup/);
    expect((await ctx("CUSTOM_ORDER", unpaid.id))?.blocker).toMatch(/balance/);
    expect((await ctx("CUSTOM_ORDER", paid.id))?.blocker).toBeNull();
    expect(await ctx("ORDER", "missing")).toBeNull();
  });

  it("only quotes when the order can be sent", async () => {
    const { provider } = fakeCourier();
    const ok = await paidOrder();
    const pickup = await paidOrder("PICKUP");
    expect(
      await quoteShipment(prisma, provider, { kind: "ORDER", id: ok.id }, settings),
    ).toHaveLength(2);
    expect(
      await quoteShipment(prisma, provider, { kind: "ORDER", id: pickup.id }, settings),
    ).toEqual([]);
  });
});

describe("booking", () => {
  it("books once, records the shipment, and refuses a second booking", async () => {
    const { provider } = fakeCourier();
    const order = await paidOrder();
    const target = { kind: "ORDER" as const, id: order.id };
    const first = await bookShipment(prisma, provider, target, {
      rateId: "premium",
      adminId: null,
      now,
      ...settings,
    });
    expect(first).toMatchObject({ ok: true, courierName: "Fake Premium" });
    const [shipment] = await listShipments(prisma, target);
    expect(shipment).toMatchObject({
      status: "BOOKED",
      feeKobo: 600_000,
      providerStatus: "pending",
    });
    expect(shipment!.events).toEqual([
      { at: now.toISOString(), status: "BOOKED", description: "Booked with Fake Premium" },
    ]);

    const second = await bookShipment(prisma, provider, target, {
      rateId: "standard",
      adminId: null,
      now,
      ...settings,
    });
    expect(second).toMatchObject({ ok: false, code: "ALREADY_BOOKED" });
  });

  it("lets only one of two simultaneous bookings through", async () => {
    const { provider, booked } = fakeCourier({ delayMs: 150 });
    const order = await paidOrder();
    const target = { kind: "ORDER" as const, id: order.id };
    const book = () =>
      bookShipment(prisma, provider, target, {
        rateId: "standard",
        adminId: null,
        now,
        ...settings,
      });
    const results = await Promise.all([book(), book()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0]).toMatchObject({ code: "ALREADY_BOOKED" });
    expect(booked).toHaveLength(1);
  });

  it("reports courier errors and ineligible orders without creating anything", async () => {
    const order = await paidOrder();
    const target = { kind: "ORDER" as const, id: order.id };
    const failed = await bookShipment(prisma, fakeCourier({ failBooking: true }).provider, target, {
      rateId: "standard",
      adminId: null,
      now,
      ...settings,
    });
    expect(failed).toEqual({
      ok: false,
      code: "COURIER",
      message: "Sendbox responded 409: bad address",
    });
    const unpaid = await readyCustomOrder(false);
    expect(
      await bookShipment(
        prisma,
        fakeCourier().provider,
        { kind: "CUSTOM_ORDER", id: unpaid.id },
        {
          rateId: "standard",
          adminId: null,
          now,
          ...settings,
        },
      ),
    ).toMatchObject({ ok: false, code: "NOT_ELIGIBLE" });
    expect(await listShipments(prisma, target)).toEqual([]);
  });
});

describe("tracking", () => {
  it("never moves backwards, and delivery fulfils a shop order once", async () => {
    const { provider } = fakeCourier();
    const order = await paidOrder();
    const booked = await bookShipment(
      prisma,
      provider,
      { kind: "ORDER", id: order.id },
      {
        rateId: "standard",
        adminId: null,
        now,
        ...settings,
      },
    );
    if (!booked.ok) throw new Error("booking failed");
    const event = (status: "IN_TRANSIT" | "PICKED_UP" | "DELIVERED", at: string) => ({
      status,
      providerStatus: status.toLowerCase(),
      events: [{ at, status, description: status }],
    });

    const moving = await applyTrackingUpdate(
      prisma,
      booked.shipmentId,
      event("IN_TRANSIT", "2026-11-05T12:00:00.000Z"),
      now,
    );
    expect(moving).toMatchObject({ changed: true, status: "IN_TRANSIT", becameDelivered: false });
    const late = await applyTrackingUpdate(
      prisma,
      booked.shipmentId,
      event("PICKED_UP", "2026-11-05T11:00:00.000Z"),
      now,
    );
    expect(late?.status).toBe("IN_TRANSIT");

    const done = new Date("2026-11-06T09:00:00Z");
    const delivered = await applyTrackingUpdate(
      prisma,
      booked.shipmentId,
      event("DELIVERED", "2026-11-06T09:00:00.000Z"),
      done,
    );
    expect(delivered).toMatchObject({ becameDelivered: true, status: "DELIVERED" });
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "FULFILLED",
      fulfilledAt: done,
    });
    const again = await applyTrackingUpdate(
      prisma,
      booked.shipmentId,
      event("DELIVERED", "2026-11-06T09:00:00.000Z"),
      done,
    );
    expect(again).toMatchObject({ becameDelivered: false, changed: false });

    const [shipment] = await listShipments(prisma, { kind: "ORDER", id: order.id });
    expect((shipment!.events as { status: string }[]).map((e) => e.status)).toEqual([
      "BOOKED",
      "PICKED_UP",
      "IN_TRANSIT",
      "DELIVERED",
    ]);
    expect(shipment!.deliveredAt).toEqual(done);
  });

  it("completes a custom order when its parcel is delivered", async () => {
    const { provider, statuses } = fakeCourier();
    const order = await readyCustomOrder(true);
    const booked = await bookShipment(
      prisma,
      provider,
      { kind: "CUSTOM_ORDER", id: order.id },
      {
        rateId: "standard",
        adminId: null,
        now,
        ...settings,
      },
    );
    if (!booked.ok) throw new Error("booking failed");
    statuses.set(booked.trackingCode, "DELIVERED");

    const run = await refreshOpenShipments(prisma, provider, now, 500);
    expect(run.delivered.map((d) => d.shipmentId)).toContain(booked.shipmentId);
    expect(await prisma.customOrder.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "COMPLETED",
    });
    const log = await prisma.customOrderStatusLog.findFirst({
      where: { customOrderId: order.id, toStatus: "COMPLETED" },
    });
    expect(log).toMatchObject({ changedById: null, note: "Delivered by courier" });
  });
});

describe("checkout with a courier price", () => {
  it("charges the courier's live price and records who quoted it", async () => {
    const p = await product();
    const reserved = await reserveRtwOrder(
      prisma,
      {
        userId: user,
        productId: p.id,
        fulfillmentMethod: "DELIVERY",
        addressId: address,
        courierQuote: { feeKobo: 450_000, courierName: "Sendbox Standard", etaDays: 4 },
      },
      new Date(),
    );
    expect(reserved).toMatchObject({ ok: true, amountKobo: 5_450_000 });
    if (!reserved.ok) return;
    expect(await prisma.order.findUnique({ where: { id: reserved.orderId } })).toMatchObject({
      deliveryFeeKobo: 450_000,
      deliveryQuotedBy: "Sendbox Standard",
      deliveryZoneId: null,
    });
  });

  it("without a courier price, uses the zone fee or refuses delivery", async () => {
    const p = await product();
    const outcome = await reserveRtwOrder(
      prisma,
      { userId: user, productId: p.id, fulfillmentMethod: "DELIVERY", addressId: address },
      new Date(),
    );
    const zone = await prisma.deliveryZone.findFirst({
      where: { isActive: true, states: { has: "FCT" } },
    });
    if (zone) expect(outcome).toMatchObject({ ok: true, amountKobo: p.priceKobo + zone.feeKobo });
    else expect(outcome).toMatchObject({ ok: false, code: "NO_DELIVERY" });
  });
});
