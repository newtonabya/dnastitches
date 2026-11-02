import { NextRequest } from "next/server";

import { signPaystackBody } from "@/lib/payments/signature";
import type { Verification } from "@/lib/payments/types";
import { reserveRtwOrder, startCustomOrderPayment } from "@/server/data/checkout";

import { createTestPrisma, uid } from "./helpers/db";

const SECRET = "sk_test_webhook_secret";
const mockVerify = jest.fn<Promise<Verification>, [string]>();
const mockRevalidateTag = jest.fn();

jest.mock("@/lib/env", () => {
  const actual = jest.requireActual("@/lib/env");
  return {
    env: { ...actual.env, PAYSTACK_SECRET_KEY: "sk_test_webhook_secret", ADMIN_EMAILS: [] },
  };
});
jest.mock("@/server/payments/provider", () => ({
  getPaymentProvider: () => ({
    name: "paystack",
    initialize: jest.fn(),
    verify: (ref: string) => mockVerify(ref),
  }),
  isDevPaymentsEnabled: () => false,
  paymentCallbackUrl: () => "http://localhost/api/payments/callback",
}));
jest.mock("next/cache", () => ({
  revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
  revalidatePath: jest.fn(),
}));
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), after: jest.fn() }));

const prisma = createTestPrisma();
const prefix = uid("routes");
const users: string[] = [];

async function setup() {
  const userId = (
    await prisma.user.create({ data: { email: `${prefix}-${users.length}@example.com` } })
  ).id;
  users.push(userId);
  const product = await prisma.product.create({
    data: {
      slug: `${prefix}-${users.length}`,
      name: "Piece",
      description: "x",
      priceKobo: 50_000_00,
      quantity: 1,
      inventoryStatus: "LOW_STOCK",
      fabricComposition: "x",
      careInstructions: "x",
      isPublished: true,
    },
  });
  const reserved = await reserveRtwOrder(prisma, {
    userId,
    productId: product.id,
    fulfillmentMethod: "PICKUP",
  });
  if (!reserved.ok) throw new Error("reserve failed");
  return { userId, product, reserved };
}

const success = (amountKobo: number): Verification => ({
  status: "success",
  amountKobo,
  currency: "NGN",
  paidAt: new Date(),
  raw: {},
});

function webhook(body: object, signature?: string) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/paystack", {
    method: "POST",
    body: raw,
    headers: { "x-paystack-signature": signature ?? signPaystackBody(raw, SECRET) },
  });
}

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { userId: { in: users } } });
  await prisma.order.deleteMany({ where: { userId: { in: users } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("POST /api/webhooks/paystack (US-A4 DoD)", () => {
  it("rejects a bad signature without touching anything", async () => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    const { reserved } = await setup();
    const res = await POST(
      webhook(
        { event: "charge.success", data: { reference: reserved.reference } },
        "ab".repeat(64),
      ),
    );
    expect(res.status).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("re-verifies with Paystack, applies once, and is idempotent on repeats", async () => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    const { reserved, product } = await setup();
    mockVerify.mockResolvedValue(success(reserved.amountKobo));
    mockRevalidateTag.mockClear();

    const event = { event: "charge.success", data: { reference: reserved.reference, amount: 1 } };
    const first = await POST(webhook(event));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: "RTW_PAID" });
    expect(mockVerify).toHaveBeenCalledWith(reserved.reference);
    expect(mockRevalidateTag).toHaveBeenCalledWith("products", { expire: 0 });

    const second = await POST(webhook(event));
    expect(await second.json()).toEqual({ received: true, outcome: "ALREADY_PROCESSED" });
    expect(
      await prisma.payment.count({ where: { orderId: reserved.orderId, status: "SUCCESS" } }),
    ).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({
      quantity: 0,
      inventoryStatus: "SOLD_OUT",
    });
  });

  it("does not trust the webhook body: a failed verification leaves the order unpaid", async () => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    const { reserved } = await setup();
    mockVerify.mockResolvedValue({ ...success(reserved.amountKobo), status: "failed" });
    await POST(webhook({ event: "charge.success", data: { reference: reserved.reference } }));
    expect(await prisma.order.findUniqueOrThrow({ where: { id: reserved.orderId } })).toMatchObject(
      { status: "CANCELLED" },
    );
  });

  it("acknowledges other events and unknown references", async () => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    expect(await (await POST(webhook({ event: "transfer.success", data: {} }))).json()).toEqual({
      received: true,
    });
    expect(
      await (
        await POST(webhook({ event: "charge.success", data: { reference: "not-ours" } }))
      ).json(),
    ).toEqual({ received: true });
  });
});

describe("GET /api/payments/callback", () => {
  it("verifies and redirects RTW buyers to their confirmation", async () => {
    const { GET } = await import("@/app/api/payments/callback/route");
    const { reserved } = await setup();
    mockVerify.mockResolvedValue(success(reserved.amountKobo));
    const res = await GET(
      new NextRequest(
        `http://localhost/api/payments/callback?reference=${reserved.reference}&trxref=${reserved.reference}`,
      ),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `http://localhost/checkout/success?order=${reserved.orderId}&payment=success`,
    );
  });

  it("sends custom-order payers back to their order with the payment state", async () => {
    const { GET } = await import("@/app/api/payments/callback/route");
    const owner = (await prisma.user.create({ data: { email: `${prefix}-custom@example.com` } }))
      .id;
    users.push(owner);
    const order = await prisma.customOrder.create({
      data: {
        reference: `${prefix}-c1`,
        userId: owner,
        status: "AWAITING_DEPOSIT",
        title: "Gown",
        description: "x",
        quotedPriceKobo: 1000,
        depositKobo: 500,
      },
    });
    const started = await startCustomOrderPayment(prisma, {
      userId: owner,
      orderId: order.id,
      kind: "CUSTOM_DEPOSIT",
    });
    if (!started.ok) throw new Error("start failed");
    mockVerify.mockResolvedValue({ ...success(500), status: "pending" });
    const pending = await GET(
      new NextRequest(`http://localhost/api/payments/callback?reference=${started.reference}`),
    );
    expect(pending.headers.get("location")).toBe(
      `http://localhost/account/wardrobe/${order.id}?payment=pending`,
    );

    mockVerify.mockResolvedValue(success(500));
    const done = await GET(
      new NextRequest(`http://localhost/api/payments/callback?reference=${started.reference}`),
    );
    expect(done.headers.get("location")).toBe(
      `http://localhost/account/wardrobe/${order.id}?payment=success`,
    );
    expect((await prisma.customOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "IN_PRODUCTION",
    );
  });

  it("ignores malformed references", async () => {
    const { GET } = await import("@/app/api/payments/callback/route");
    const res = await GET(
      new NextRequest("http://localhost/api/payments/callback?reference=%3Cscript%3E"),
    );
    expect(res.headers.get("location")).toBe("http://localhost/account/wardrobe");
  });
});
