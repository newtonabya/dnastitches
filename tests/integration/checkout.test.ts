import type { Verification } from "@/lib/payments/types";
import {
  CLAIMED_MESSAGE,
  cancelPendingOrder,
  expireStaleOrders,
  finalizePayment,
  markOrderFulfilled,
  reserveRtwOrder,
  startCustomOrderPayment,
} from "@/server/data/checkout";

import { createTestPrisma, uid } from "./helpers/db";

const prisma = createTestPrisma();
const prefix = uid("checkout");
const users: string[] = [];
let zoneId = "";

const minutes = (n: number) => n * 60_000;
const success = (amountKobo: number): Verification => ({
  status: "success",
  amountKobo,
  currency: "NGN",
  paidAt: new Date(),
  raw: { ok: true },
});

async function user(label: string) {
  const id = (await prisma.user.create({ data: { email: `${prefix}-${label}@example.com` } })).id;
  users.push(id);
  return id;
}

async function product(label: string, quantity = 1) {
  return prisma.product.create({
    data: {
      slug: `${prefix}-${label}`,
      name: label,
      description: "x",
      priceKobo: 100_000_00,
      quantity,
      inventoryStatus: quantity === 0 ? "SOLD_OUT" : quantity === 1 ? "LOW_STOCK" : "AVAILABLE",
      fabricComposition: "x",
      careInstructions: "x",
      isPublished: true,
    },
  });
}

beforeAll(async () => {
  zoneId = (
    await prisma.deliveryZone.create({
      data: { name: `${prefix} Zamfara`, states: ["Zamfara"], feeKobo: 5_000_00, etaDays: 3 },
    })
  ).id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { userId: { in: users } } });
  await prisma.order.deleteMany({ where: { userId: { in: users } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.address.deleteMany({ where: { userId: { in: users } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.deliveryZone.deleteMany({ where: { id: zoneId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("reserveRtwOrder (US-A4)", () => {
  it("creates a pending order and payment; pickup has no fee", async () => {
    const buyer = await user("pickup");
    const p = await product("pickup");
    const result = await reserveRtwOrder(prisma, {
      userId: buyer,
      productId: p.id,
      fulfillmentMethod: "PICKUP",
    });
    expect(result).toMatchObject({
      ok: true,
      amountKobo: 100_000_00,
      email: `${prefix}-pickup@example.com`,
    });
    if (!result.ok) return;
    expect(await prisma.order.findUnique({ where: { id: result.orderId } })).toMatchObject({
      status: "PENDING_PAYMENT",
      subtotalKobo: 100_000_00,
      deliveryFeeKobo: 0,
      totalKobo: 100_000_00,
      fulfillmentMethod: "PICKUP",
    });
    expect(
      await prisma.payment.findUnique({ where: { paystackReference: result.reference } }),
    ).toMatchObject({
      status: "PENDING",
      kind: "RTW_FULL",
      amountKobo: 100_000_00,
    });
    // Stock is untouched until payment succeeds.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).quantity).toBe(1);
  });

  it("adds the zone fee for delivery and refuses states with no active zone (AC2)", async () => {
    const buyer = await user("delivery");
    const p = await product("delivery");
    const zamfara = await prisma.address.create({
      data: {
        userId: buyer,
        recipientName: "R",
        phone: "+2348031234567",
        line1: "1 Rd",
        city: "Gusau",
        state: "Zamfara",
      },
    });
    const nowhere = await prisma.address.create({
      data: {
        userId: buyer,
        recipientName: "R",
        phone: "+2348031234567",
        line1: "1 Rd",
        city: "X",
        state: "Yobe",
      },
    });

    const yobe = await reserveRtwOrder(prisma, {
      userId: buyer,
      productId: p.id,
      fulfillmentMethod: "DELIVERY",
      addressId: nowhere.id,
    });
    // Yobe isn't in any test or seeded zone, so delivery there is refused.
    expect(yobe).toMatchObject({
      ok: false,
      code: "NO_DELIVERY",
      message: "We don't deliver to Yobe yet. Please choose pickup.",
    });

    const ok = await reserveRtwOrder(prisma, {
      userId: buyer,
      productId: p.id,
      fulfillmentMethod: "DELIVERY",
      addressId: zamfara.id,
    });
    expect(ok).toMatchObject({ ok: true, amountKobo: 105_000_00 });
    if (ok.ok)
      expect(await prisma.order.findUnique({ where: { id: ok.orderId } })).toMatchObject({
        deliveryFeeKobo: 5_000_00,
        deliveryZoneId: zoneId,
        addressId: zamfara.id,
      });

    const stranger = await user("stranger");
    expect(
      await reserveRtwOrder(prisma, {
        userId: stranger,
        productId: (await product("other")).id,
        fulfillmentMethod: "DELIVERY",
        addressId: zamfara.id,
      }),
    ).toMatchObject({
      ok: false,
      code: "ADDRESS",
    });
  });

  it("only one of two concurrent buyers can reserve the last piece (AC5)", async () => {
    const [a, b] = [await user("race-a"), await user("race-b")];
    const p = await product("race");
    const results = await Promise.all([
      reserveRtwOrder(prisma, { userId: a, productId: p.id, fulfillmentMethod: "PICKUP" }),
      reserveRtwOrder(prisma, { userId: b, productId: p.id, fulfillmentMethod: "PICKUP" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      code: "CLAIMED",
      message: CLAIMED_MESSAGE,
    });
  });

  it("frees the piece after 15 minutes, and lets the same buyer retry (AC7)", async () => {
    const [a, b] = [await user("hold-a"), await user("hold-b")];
    const p = await product("hold");
    const t0 = new Date();
    const first = await reserveRtwOrder(
      prisma,
      { userId: a, productId: p.id, fulfillmentMethod: "PICKUP" },
      t0,
    );
    expect(first.ok).toBe(true);
    expect(
      (
        await reserveRtwOrder(
          prisma,
          { userId: b, productId: p.id, fulfillmentMethod: "PICKUP" },
          new Date(t0.getTime() + minutes(14)),
        )
      ).ok,
    ).toBe(false);
    // The same buyer retrying replaces their own hold.
    expect(
      (
        await reserveRtwOrder(
          prisma,
          { userId: a, productId: p.id, fulfillmentMethod: "PICKUP" },
          new Date(t0.getTime() + minutes(1)),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await reserveRtwOrder(
          prisma,
          { userId: b, productId: p.id, fulfillmentMethod: "PICKUP" },
          new Date(t0.getTime() + minutes(17)),
        )
      ).ok,
    ).toBe(true);

    expect(
      await expireStaleOrders(prisma, new Date(t0.getTime() + minutes(40)), p.id),
    ).toBeGreaterThanOrEqual(1);
    const statuses = await prisma.order.findMany({
      where: { productId: p.id },
      select: { status: true },
    });
    expect(statuses.every((o) => o.status === "CANCELLED")).toBe(true);
    expect(
      await prisma.payment.count({ where: { order: { productId: p.id }, status: "PENDING" } }),
    ).toBe(0);
  });

  it("rejects unpublished products", async () => {
    const buyer = await user("draft");
    const p = await product("draft");
    await prisma.product.update({ where: { id: p.id }, data: { isPublished: false } });
    expect(
      await reserveRtwOrder(prisma, {
        userId: buyer,
        productId: p.id,
        fulfillmentMethod: "PICKUP",
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("finalizePayment (US-A4 AC6)", () => {
  it("marks the order PAID, decrements stock and re-derives status — exactly once", async () => {
    const buyer = await user("pay");
    const p = await product("pay");
    const r = await reserveRtwOrder(prisma, {
      userId: buyer,
      productId: p.id,
      fulfillmentMethod: "PICKUP",
    });
    if (!r.ok) throw new Error("reserve failed");

    const results = await Promise.all([
      finalizePayment(prisma, r.reference, success(r.amountKobo)),
      finalizePayment(prisma, r.reference, success(r.amountKobo)),
    ]);
    expect(results.map((x) => x.outcome).sort()).toEqual(["ALREADY_PROCESSED", "RTW_PAID"]);
    expect(await finalizePayment(prisma, r.reference, success(r.amountKobo))).toMatchObject({
      outcome: "ALREADY_PROCESSED",
    });

    expect(await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      quantity: 0,
      inventoryStatus: "SOLD_OUT",
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: r.orderId } })).toMatchObject({
      status: "PAID",
    });
    expect(await prisma.payment.count({ where: { orderId: r.orderId, status: "SUCCESS" } })).toBe(
      1,
    );

    expect(await markOrderFulfilled(prisma, r.orderId)).toBe(true);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: r.orderId } })).fulfilledAt,
    ).toBeInstanceOf(Date);
    expect(await markOrderFulfilled(prisma, r.orderId)).toBe(false);
  });

  it("rejects amount mismatches and records failures; failed payments release the hold", async () => {
    const buyer = await user("mismatch");
    const p = await product("mismatch");
    const r = await reserveRtwOrder(prisma, {
      userId: buyer,
      productId: p.id,
      fulfillmentMethod: "PICKUP",
    });
    if (!r.ok) throw new Error("reserve failed");
    expect(await finalizePayment(prisma, r.reference, success(1))).toMatchObject({
      outcome: "AMOUNT_MISMATCH",
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).quantity).toBe(1);

    const r2 = await reserveRtwOrder(prisma, {
      userId: buyer,
      productId: p.id,
      fulfillmentMethod: "PICKUP",
    });
    if (!r2.ok) throw new Error("reserve failed");
    expect(
      await finalizePayment(prisma, r2.reference, { ...success(r2.amountKobo), status: "pending" }),
    ).toMatchObject({ outcome: "PENDING" });
    expect(
      await finalizePayment(prisma, r2.reference, {
        ...success(r2.amountKobo),
        status: "abandoned",
      }),
    ).toMatchObject({ outcome: "FAILED" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: r2.orderId } })).toMatchObject({
      status: "CANCELLED",
    });
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { paystackReference: r2.reference } }),
    ).toMatchObject({ status: "ABANDONED" });
    expect(await finalizePayment(prisma, "dna-rtw-unknown", success(1))).toEqual({
      outcome: "UNKNOWN_REFERENCE",
    });
  });

  it("honours a late payment if the piece is still free, but not if someone else bought it", async () => {
    const [a, b, c] = [await user("late-a"), await user("late-b"), await user("late-c")];
    const p = await product("late", 1);
    const t0 = new Date();
    const late = await reserveRtwOrder(
      prisma,
      { userId: a, productId: p.id, fulfillmentMethod: "PICKUP" },
      t0,
    );
    if (!late.ok) throw new Error("reserve failed");
    await expireStaleOrders(prisma, new Date(t0.getTime() + minutes(20)), p.id);
    // Paid after the hold lapsed, nobody else holds it → honoured.
    expect(
      await finalizePayment(
        prisma,
        late.reference,
        success(late.amountKobo),
        new Date(t0.getTime() + minutes(21)),
      ),
    ).toMatchObject({
      outcome: "RTW_PAID",
    });

    const p2 = await product("late2", 1);
    const lapsed = await reserveRtwOrder(
      prisma,
      { userId: b, productId: p2.id, fulfillmentMethod: "PICKUP" },
      t0,
    );
    const other = await reserveRtwOrder(
      prisma,
      { userId: c, productId: p2.id, fulfillmentMethod: "PICKUP" },
      new Date(t0.getTime() + minutes(16)),
    );
    if (!lapsed.ok || !other.ok) throw new Error("reserve failed");
    expect(
      await finalizePayment(
        prisma,
        lapsed.reference,
        success(lapsed.amountKobo),
        new Date(t0.getTime() + minutes(17)),
      ),
    ).toMatchObject({
      outcome: "RTW_PAID_UNAVAILABLE",
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p2.id } })).quantity).toBe(1);
    await cancelPendingOrder(prisma, other.orderId);
  });
});

describe("custom-order payments (US-C4)", () => {
  async function customOrder(
    owner: string,
    status: "AWAITING_DEPOSIT" | "READY" | "FITTING",
    extra = {},
  ) {
    return prisma.customOrder.create({
      data: {
        reference: `${prefix}-${Math.random().toString(36).slice(2, 8)}`,
        userId: owner,
        status,
        title: "Gown",
        description: "x",
        quotedPriceKobo: 200_000_00,
        depositKobo: 100_000_00,
        deliveryFeeKobo: 5_000_00,
        ...extra,
      },
    });
  }

  it("deposit payment moves the order to IN_PRODUCTION automatically, logged as system (AC3)", async () => {
    const owner = await user("dep");
    const order = await customOrder(owner, "AWAITING_DEPOSIT");
    const start = await startCustomOrderPayment(prisma, {
      userId: owner,
      orderId: order.id,
      kind: "CUSTOM_DEPOSIT",
    });
    expect(start).toMatchObject({ ok: true, amountKobo: 100_000_00 });
    if (!start.ok) return;
    expect(await finalizePayment(prisma, start.reference, success(start.amountKobo))).toMatchObject(
      { outcome: "DEPOSIT_PAID", advancedTo: "IN_PRODUCTION" },
    );
    expect((await prisma.customOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "IN_PRODUCTION",
    );
    expect(
      await prisma.customOrderStatusLog.findFirst({ where: { customOrderId: order.id } }),
    ).toMatchObject({
      fromStatus: "AWAITING_DEPOSIT",
      toStatus: "IN_PRODUCTION",
      changedById: null,
    });
    // The deposit can't be paid twice.
    expect(
      await startCustomOrderPayment(prisma, {
        userId: owner,
        orderId: order.id,
        kind: "CUSTOM_DEPOSIT",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PAYABLE" });
  });

  it("balance is payable only when READY and only the amount still due (AC4)", async () => {
    const owner = await user("bal");
    const fitting = await customOrder(owner, "FITTING");
    expect(
      await startCustomOrderPayment(prisma, {
        userId: owner,
        orderId: fitting.id,
        kind: "CUSTOM_BALANCE",
      }),
    ).toMatchObject({ ok: false, code: "NOT_PAYABLE" });

    const ready = await customOrder(owner, "READY");
    await prisma.payment.create({
      data: {
        userId: owner,
        kind: "CUSTOM_DEPOSIT",
        channel: "OFFLINE",
        status: "SUCCESS",
        amountKobo: 100_000_00,
        customOrderId: ready.id,
      },
    });
    const first = await startCustomOrderPayment(prisma, {
      userId: owner,
      orderId: ready.id,
      kind: "CUSTOM_BALANCE",
    });
    expect(first).toMatchObject({ ok: true, amountKobo: 105_000_00 });
    // Starting again abandons the previous pending attempt.
    const second = await startCustomOrderPayment(prisma, {
      userId: owner,
      orderId: ready.id,
      kind: "CUSTOM_BALANCE",
    });
    if (!first.ok || !second.ok) return;
    expect(
      await prisma.payment.findUnique({ where: { paystackReference: first.reference } }),
    ).toMatchObject({ status: "ABANDONED" });
    expect(
      await finalizePayment(prisma, second.reference, success(second.amountKobo)),
    ).toMatchObject({ outcome: "CUSTOM_PAID" });
  });

  it("customers can only pay their own orders", async () => {
    const [owner, other] = [await user("own"), await user("notown")];
    const order = await customOrder(owner, "AWAITING_DEPOSIT");
    expect(
      await startCustomOrderPayment(prisma, {
        userId: other,
        orderId: order.id,
        kind: "CUSTOM_DEPOSIT",
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
