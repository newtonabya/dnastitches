import type { CourierProvider } from "@/lib/courier/types";
import { courierWebhookToken } from "@/lib/courier/webhook-token";

import { createTestPrisma, uid } from "./helpers/db";

const mockTrack = jest.fn<ReturnType<CourierProvider["track"]>, [string]>();
const mockSendEmail = jest.fn();

jest.mock("@/server/courier", () => ({
  getCourierProvider: () => ({
    name: "dev",
    quote: jest.fn(),
    book: jest.fn(),
    track: (code: string) => mockTrack(code),
  }),
}));
jest.mock("@/server/notifications/shipping", () => ({
  sendShippingEmailNow: (...a: unknown[]) => mockSendEmail(...a),
}));

// Imported after the mocks.
import { POST } from "@/app/api/webhooks/sendbox/route";

const prisma = createTestPrisma();
const prefix = uid("courier-routes");
const SECRET = process.env.AUTH_SECRET!;

function webhook(token: string | null, body: unknown) {
  const url = `http://localhost/api/webhooks/sendbox${token === null ? "" : `?token=${token}`}`;
  return POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));
}

let shipmentId = "";
let orderId = "";
const code = `${prefix}-CODE`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${prefix}@example.com` } });
  const product = await prisma.product.create({
    data: {
      slug: prefix,
      name: "Piece",
      description: "x",
      priceKobo: 1000,
      quantity: 0,
      inventoryStatus: "SOLD_OUT",
      fabricComposition: "x",
      careInstructions: "x",
    },
  });
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      productId: product.id,
      subtotalKobo: 1000,
      totalKobo: 1000,
      status: "PAID",
      fulfillmentMethod: "DELIVERY",
      finalSaleAcknowledgedAt: new Date(),
    },
  });
  orderId = order.id;
  shipmentId = (
    await prisma.shipment.create({
      data: {
        orderId,
        provider: "dev",
        providerShipmentId: "p1",
        trackingCode: code,
        courierName: "Fake",
        feeKobo: 1,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

it("rejects a missing or wrong token without calling the courier", async () => {
  expect((await webhook(null, { code })).status).toBe(401);
  expect((await webhook("nope", { code })).status).toBe(401);
  expect(mockTrack).not.toHaveBeenCalled();
});

it("ignores unknown codes and bodies it can't read", async () => {
  const token = courierWebhookToken(SECRET);
  expect((await webhook(token, { code: "unknown-code" })).status).toBe(200);
  expect((await webhook(token, "not json")).status).toBe(200);
  expect(mockTrack).not.toHaveBeenCalled();
});

it("treats the body only as a nudge: the status comes from the courier", async () => {
  mockTrack.mockResolvedValue({
    trackingCode: code,
    status: "DELIVERED",
    providerStatus: "delivered",
    events: [{ at: "2026-11-06T09:00:00.000Z", status: "DELIVERED", description: "Delivered" }],
  });
  const token = courierWebhookToken(SECRET);
  // The body claims nothing useful; we still fetch the truth.
  const res = await webhook(token, { data: { tracking_code: code, status: "cancelled" } });
  expect(res.status).toBe(200);
  expect(mockTrack).toHaveBeenCalledWith(code);
  expect(await prisma.shipment.findUnique({ where: { id: shipmentId } })).toMatchObject({
    status: "DELIVERED",
  });
  expect(await prisma.order.findUnique({ where: { id: orderId } })).toMatchObject({
    status: "FULFILLED",
  });
  expect(mockSendEmail).toHaveBeenCalledWith(shipmentId, "DELIVERED");
});
