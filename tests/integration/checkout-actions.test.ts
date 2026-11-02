import { FINAL_SALE_MESSAGE } from "@/lib/validators/payments";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockInitialize = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
jest.mock("@/server/payments/provider", () => ({
  getPaymentProvider: () => ({
    name: "paystack",
    initialize: (i: unknown) => mockInitialize(i),
    verify: jest.fn(),
  }),
  paymentCallbackUrl: () => "https://dna.example/api/payments/callback",
}));

const prisma = createTestPrisma();
const prefix = uid("checkout-actions");
const users: string[] = [];
let productId = "";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

beforeAll(async () => {
  for (const label of ["a", "b"])
    users.push(
      (await prisma.user.create({ data: { email: `${prefix}-${label}@example.com` } })).id,
    );
  productId = (
    await prisma.product.create({
      data: {
        slug: prefix,
        name: "Piece",
        description: "x",
        priceKobo: 1000,
        quantity: 1,
        inventoryStatus: "LOW_STOCK",
        fabricComposition: "x",
        careInstructions: "x",
        isPublished: true,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { userId: { in: users } } });
  await prisma.order.deleteMany({ where: { userId: { in: users } } });
  await prisma.product.deleteMany({ where: { slug: prefix } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("startCheckoutAction (US-A4)", () => {
  it("rejects checkout without the final-sale acknowledgement, creating nothing (AC3 DoD)", async () => {
    const { startCheckoutAction } = await import("@/server/actions/checkout");
    mockAuth.mockResolvedValue({ user: { id: users[0], role: "CUSTOMER" } });
    expect(
      await startCheckoutAction(null, form({ productId, fulfillmentMethod: "PICKUP" })),
    ).toEqual({
      ok: false,
      fieldErrors: { finalSaleAcknowledged: FINAL_SALE_MESSAGE },
    });
    expect(await prisma.order.count({ where: { productId } })).toBe(0);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    const { startCheckoutAction } = await import("@/server/actions/checkout");
    mockAuth.mockResolvedValue(null);
    expect(
      await startCheckoutAction(
        null,
        form({ productId, fulfillmentMethod: "PICKUP", finalSaleAcknowledged: "on" }),
      ),
    ).toMatchObject({ ok: false });
  });

  it("redirects to Paystack, then tells a second buyer the piece was just claimed (AC5)", async () => {
    const { startCheckoutAction } = await import("@/server/actions/checkout");
    mockInitialize.mockResolvedValue({ authorizationUrl: "https://checkout.paystack.com/xyz" });
    mockAuth.mockResolvedValue({ user: { id: users[0], role: "CUSTOMER" } });
    const error = await startCheckoutAction(
      null,
      form({ productId, fulfillmentMethod: "PICKUP", finalSaleAcknowledged: "on" }),
    ).catch((e) => e);
    expect(error.url).toBe("https://checkout.paystack.com/xyz");
    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        amountKobo: 1000,
        email: `${prefix}-a@example.com`,
        callbackUrl: "https://dna.example/api/payments/callback",
      }),
    );

    mockAuth.mockResolvedValue({ user: { id: users[1], role: "CUSTOMER" } });
    expect(
      await startCheckoutAction(
        null,
        form({ productId, fulfillmentMethod: "PICKUP", finalSaleAcknowledged: "on" }),
      ),
    ).toEqual({
      ok: false,
      formError: "This piece was just claimed.",
      fieldErrors: { code: "CLAIMED" },
    });
  });

  it("releases the hold if Paystack can't start the payment", async () => {
    const { startCheckoutAction } = await import("@/server/actions/checkout");
    await prisma.order.updateMany({ where: { productId }, data: { status: "CANCELLED" } });
    mockInitialize.mockRejectedValue(new Error("network down"));
    mockAuth.mockResolvedValue({ user: { id: users[1], role: "CUSTOMER" } });
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await startCheckoutAction(
        null,
        form({ productId, fulfillmentMethod: "PICKUP", finalSaleAcknowledged: "on" }),
      ),
    ).toMatchObject({
      ok: false,
      formError: expect.stringContaining("payment provider"),
    });
    expect(await prisma.order.count({ where: { productId, status: "PENDING_PAYMENT" } })).toBe(0);
  });
});
