import {
  getAdminOrderDetail,
  listClosedOrders,
  listPipelineCards,
  recordOfflinePayment,
  sendQuote,
  transitionCustomOrder,
} from "@/server/data/admin/orders";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockAfter = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));

const prisma = createTestPrisma();
const prefix = uid("admin-orders");
let customer = "";
let admin = "";
let seq = 0;

async function newOrder(
  status: "REQUEST_RECEIVED" | "MEASUREMENTS_TAKEN" | "AWAITING_DEPOSIT" = "REQUEST_RECEIVED",
  extra = {},
) {
  seq += 1;
  return prisma.customOrder.create({
    data: {
      reference: `${prefix}-${seq}`,
      userId: customer,
      status,
      title: `Order ${seq}`,
      description: "x",
      ...extra,
    },
  });
}

const logs = (orderId: string) =>
  prisma.customOrderStatusLog.findMany({
    where: { customOrderId: orderId },
    orderBy: { createdAt: "asc" },
  });

beforeAll(async () => {
  customer = (await prisma.user.create({ data: { email: `${prefix}-c@example.com`, name: "Ada" } }))
    .id;
  admin = (await prisma.user.create({ data: { email: `${prefix}-a@example.com`, role: "ADMIN" } }))
    .id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { userId: customer } });
  await prisma.customOrder.deleteMany({ where: { userId: customer } });
  await prisma.user.deleteMany({ where: { id: { in: [customer, admin] } } });
  await prisma.$disconnect();
});

describe("transitionCustomOrder (US-C1)", () => {
  it("moves along allowed edges and writes the log atomically (AC3–4)", async () => {
    const order = await newOrder();
    expect(
      await transitionCustomOrder(prisma, {
        orderId: order.id,
        to: "CONSULTATION_PENDING",
        actorId: admin,
        note: "Called her",
      }),
    ).toEqual({
      ok: true,
      from: "REQUEST_RECEIVED",
      to: "CONSULTATION_PENDING",
    });
    expect(await logs(order.id)).toEqual([
      expect.objectContaining({
        fromStatus: "REQUEST_RECEIVED",
        toStatus: "CONSULTATION_PENDING",
        changedById: admin,
        note: "Called her",
      }),
    ]);
  });

  it("rejects disallowed edges and unmet gates without writing anything", async () => {
    const order = await newOrder("MEASUREMENTS_TAKEN");
    expect(
      await transitionCustomOrder(prisma, { orderId: order.id, to: "READY", actorId: admin }),
    ).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(
      await transitionCustomOrder(prisma, {
        orderId: order.id,
        to: "AWAITING_DEPOSIT",
        actorId: admin,
      }),
    ).toMatchObject({
      ok: false,
      code: "QUOTE_MISSING",
    });
    const awaiting = await newOrder("AWAITING_DEPOSIT", {
      quotedPriceKobo: 1000,
      depositKobo: 500,
    });
    expect(
      await transitionCustomOrder(prisma, {
        orderId: awaiting.id,
        to: "IN_PRODUCTION",
        actorId: admin,
      }),
    ).toEqual({
      ok: false,
      code: "DEPOSIT_NOT_PAID",
      message: "Deposit not yet paid.",
    });
    expect(await logs(order.id)).toHaveLength(0);
    expect(await logs(awaiting.id)).toHaveLength(0);
    expect((await prisma.customOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "MEASUREMENTS_TAKEN",
    );
  });

  it("two admins acting on the same screen state: only one move succeeds", async () => {
    const order = await newOrder();
    const results = await Promise.all([
      transitionCustomOrder(prisma, {
        orderId: order.id,
        to: "CONSULTATION_PENDING",
        actorId: admin,
        expectedFrom: "REQUEST_RECEIVED",
      }),
      transitionCustomOrder(prisma, {
        orderId: order.id,
        to: "CANCELLED",
        actorId: admin,
        expectedFrom: "REQUEST_RECEIVED",
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: "CONFLICT" });
    expect(await logs(order.id)).toHaveLength(1);
  });
});

describe("quote → deposit → production → completion (US-C4 admin side)", () => {
  it("runs the whole paid pipeline with gates", async () => {
    const order = await newOrder("MEASUREMENTS_TAKEN");
    expect(
      await sendQuote(prisma, {
        orderId: order.id,
        quotedPriceKobo: 200_000_00,
        depositKobo: 100_000_00,
        deliveryFeeKobo: 5_000_00,
        actorId: admin,
      }),
    ).toEqual({
      ok: true,
      movedToAwaitingDeposit: true,
    });
    const quoted = await prisma.customOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(quoted).toMatchObject({
      status: "AWAITING_DEPOSIT",
      quotedPriceKobo: 200_000_00,
      depositKobo: 100_000_00,
      deliveryFeeKobo: 5_000_00,
    });
    expect(quoted.quoteSentAt).toBeInstanceOf(Date);

    // Revising the quote while awaiting the deposit doesn't move the order.
    expect(
      await sendQuote(prisma, {
        orderId: order.id,
        quotedPriceKobo: 210_000_00,
        depositKobo: 100_000_00,
        deliveryFeeKobo: 5_000_00,
        actorId: admin,
      }),
    ).toEqual({
      ok: true,
      movedToAwaitingDeposit: false,
    });

    const deposit = await recordOfflinePayment(prisma, {
      orderId: order.id,
      kind: "CUSTOM_DEPOSIT",
      amountKobo: 100_000_00,
      note: "Cash at studio",
      actorId: admin,
    });
    expect(deposit).toMatchObject({ ok: true, advancedTo: "IN_PRODUCTION" });
    expect(await prisma.payment.findFirst({ where: { customOrderId: order.id } })).toMatchObject({
      channel: "OFFLINE",
      status: "SUCCESS",
      recordedById: admin,
      userId: customer,
      rawEvent: { note: "Cash at studio" },
    });

    // Quote is locked once in production.
    expect(
      await sendQuote(prisma, {
        orderId: order.id,
        quotedPriceKobo: 1,
        depositKobo: 1,
        deliveryFeeKobo: 0,
        actorId: admin,
      }),
    ).toMatchObject({
      ok: false,
      code: "NOT_QUOTABLE",
    });

    for (const to of ["FITTING", "IN_PRODUCTION", "FITTING", "READY"] as const) {
      expect(
        (await transitionCustomOrder(prisma, { orderId: order.id, to, actorId: admin })).ok,
      ).toBe(true);
    }
    expect(
      await transitionCustomOrder(prisma, { orderId: order.id, to: "COMPLETED", actorId: admin }),
    ).toMatchObject({
      ok: false,
      code: "BALANCE_DUE",
    });
    await recordOfflinePayment(prisma, {
      orderId: order.id,
      kind: "CUSTOM_BALANCE",
      amountKobo: 115_000_00,
      actorId: admin,
    });
    expect(
      await transitionCustomOrder(prisma, { orderId: order.id, to: "COMPLETED", actorId: admin }),
    ).toMatchObject({ ok: true });

    const detail = await getAdminOrderDetail(prisma, order.id);
    expect(detail?.balance).toEqual({
      totalDueKobo: 215_000_00,
      paidKobo: 215_000_00,
      balanceDueKobo: 0,
      hasSuccessfulDeposit: true,
    });
    expect(detail?.completedAt).toBeInstanceOf(Date);
    expect(detail?.statusLogs.map((l) => l.toStatus)).toEqual([
      "AWAITING_DEPOSIT",
      "IN_PRODUCTION",
      "FITTING",
      "IN_PRODUCTION",
      "FITTING",
      "READY",
      "COMPLETED",
    ]);
    expect((await listClosedOrders(prisma, "COMPLETED")).map((c) => c.id)).toContain(order.id);
    expect((await listPipelineCards(prisma)).map((c) => c.id)).not.toContain(order.id);
  });

  it("cancelling after a deposit needs explicit confirmation (AC7)", async () => {
    const order = await newOrder("AWAITING_DEPOSIT", { quotedPriceKobo: 1000, depositKobo: 500 });
    // A partial deposit recorded as a balance payment won't auto-advance; record a deposit directly in the DB.
    await prisma.payment.create({
      data: {
        userId: customer,
        kind: "CUSTOM_DEPOSIT",
        channel: "OFFLINE",
        status: "SUCCESS",
        amountKobo: 100,
        customOrderId: order.id,
      },
    });
    expect(
      await transitionCustomOrder(prisma, { orderId: order.id, to: "CANCELLED", actorId: admin }),
    ).toMatchObject({
      ok: false,
      code: "CONFIRM_FORFEIT",
    });
    expect(
      await transitionCustomOrder(prisma, {
        orderId: order.id,
        to: "CANCELLED",
        actorId: admin,
        confirmForfeit: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses payments on cancelled orders", async () => {
    const order = await newOrder();
    await transitionCustomOrder(prisma, { orderId: order.id, to: "CANCELLED", actorId: admin });
    expect(
      await recordOfflinePayment(prisma, {
        orderId: order.id,
        kind: "CUSTOM_BALANCE",
        amountKobo: 100,
        actorId: admin,
      }),
    ).toMatchObject({
      ok: false,
      code: "CANCELLED",
    });
  });
});

describe("admin order actions", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };

  it("refuse non-admins, even with a session that claims ADMIN (role re-read from DB)", async () => {
    const actions = await import("@/server/actions/admin/orders");
    const order = await newOrder();
    for (const session of [null, { user: { id: customer, role: "ADMIN" } }]) {
      mockAuth.mockResolvedValue(session);
      expect(
        await actions.updateCustomOrderStatus(
          null,
          form({ orderId: order.id, to: "CONSULTATION_PENDING" }),
        ),
      ).toEqual({
        ok: false,
        formError: "You don't have access to do that.",
      });
      expect(await actions.sendQuoteAction(null, form({}))).toMatchObject({ ok: false });
      expect(await actions.recordOfflinePaymentAction(null, form({}))).toMatchObject({ ok: false });
      expect(await actions.updateAdminNotesAction(null, form({ orderId: order.id }))).toMatchObject(
        { ok: false },
      );
    }
    expect(await logs(order.id)).toHaveLength(0);
  });

  it("moves an order, returns gate errors for the board, and queues the customer email", async () => {
    const { updateCustomOrderStatus, sendQuoteAction, updateAdminNotesAction } =
      await import("@/server/actions/admin/orders");
    mockAuth.mockResolvedValue({ user: { id: admin, role: "ADMIN" } });
    const order = await newOrder("MEASUREMENTS_TAKEN");

    expect(
      await updateCustomOrderStatus(null, form({ orderId: order.id, to: "AWAITING_DEPOSIT" })),
    ).toEqual({
      ok: false,
      formError: "Set the quoted price and deposit before requesting a deposit.",
      fieldErrors: { code: "QUOTE_MISSING" },
    });

    mockAfter.mockClear();
    expect(
      await sendQuoteAction(
        null,
        form({
          orderId: order.id,
          quotedPriceNaira: "250,000",
          depositNaira: "125000",
          deliveryFeeNaira: "",
        }),
      ),
    ).toEqual({
      ok: true,
      message: "Quote sent. The order is now awaiting the deposit.",
    });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(await prisma.customOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      quotedPriceKobo: 25_000_000,
      deliveryFeeKobo: 0,
    });

    expect(
      await sendQuoteAction(
        null,
        form({ orderId: order.id, quotedPriceNaira: "100", depositNaira: "500" }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { depositNaira: "Deposit can't be more than the total" },
    });

    expect(
      await updateAdminNotesAction(
        null,
        form({ orderId: order.id, adminNotes: "Prefers WhatsApp" }),
      ),
    ).toEqual({ ok: true, message: "Notes saved." });
    expect(
      (await prisma.customOrder.findUniqueOrThrow({ where: { id: order.id } })).adminNotes,
    ).toBe("Prefers WhatsApp");
  });
});
