import { REJECTION_REASON_REQUIRED } from "@/lib/validators/repairs";
import {
  createRepairRequest,
  getRepairTarget,
  listAdminRepairs,
  listUserRepairs,
  updateRepairRequest,
} from "@/server/data/repairs";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockAfter = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const prisma = createTestPrisma();
const prefix = uid("repairs");
const DAY = 24 * 60 * 60 * 1000;
let customer = "";
let stranger = "";
let admin = "";
let productId = "";
let seq = 0;

async function shopOrder(status: "PAID" | "FULFILLED", fulfilledAt: Date | null) {
  return prisma.order.create({
    data: {
      userId: customer,
      productId,
      subtotalKobo: 1000,
      totalKobo: 1000,
      status,
      fulfillmentMethod: "PICKUP",
      finalSaleAcknowledgedAt: new Date(),
      fulfilledAt,
    },
  });
}

async function customOrder(status: "READY" | "COMPLETED", completedAt: Date | null) {
  return prisma.customOrder.create({
    data: {
      reference: `${prefix}-${++seq}`,
      userId: customer,
      status,
      title: "Wedding gown",
      description: "x",
      completedAt,
    },
  });
}

const input = (kind: "ORDER" | "CUSTOM_ORDER", targetId: string) => ({
  kind,
  targetId,
  description: "The zip broke on the first wear.",
  photoUrls: [],
});

beforeAll(async () => {
  [customer, stranger, admin] = (await Promise.all(
    ["c", "s", "a"].map(
      async (l) =>
        (
          await prisma.user.create({
            data: { email: `${prefix}-${l}@example.com`, role: l === "a" ? "ADMIN" : "CUSTOMER" },
          })
        ).id,
    ),
  )) as [string, string, string];
  productId = (
    await prisma.product.create({
      data: {
        slug: prefix,
        name: "Adire Wrap Dress",
        description: "x",
        priceKobo: 1000,
        quantity: 0,
        inventoryStatus: "SOLD_OUT",
        fabricComposition: "x",
        careInstructions: "x",
      },
    })
  ).id;
});

afterAll(async () => {
  const users = [customer, stranger, admin];
  await prisma.repairRequest.deleteMany({ where: { userId: { in: users } } });
  await prisma.order.deleteMany({ where: { userId: { in: users } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: users } } });
  await prisma.product.deleteMany({ where: { slug: prefix } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe("createRepairRequest (US-D3 AC1–AC2)", () => {
  it("creates an OPEN request for a fulfilled shop order inside the window", async () => {
    const now = new Date();
    const order = await shopOrder("FULFILLED", new Date(now.getTime() - 6 * DAY));
    const result = await createRepairRequest(prisma, customer, input("ORDER", order.id), now, 7);
    expect(result.ok).toBe(true);
    const repair = await prisma.repairRequest.findUniqueOrThrow({
      where: { id: result.ok ? result.repairId : "" },
    });
    expect(repair).toMatchObject({ status: "OPEN", orderId: order.id, customOrderId: null });
    // Repairs never create a payment (AC4).
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("works for a completed custom order and refuses a second open request", async () => {
    const now = new Date();
    const order = await customOrder("COMPLETED", new Date(now.getTime() - DAY));
    expect(
      (await createRepairRequest(prisma, customer, input("CUSTOM_ORDER", order.id), now, 7)).ok,
    ).toBe(true);
    expect(
      await createRepairRequest(prisma, customer, input("CUSTOM_ORDER", order.id), now, 7),
    ).toEqual({ ok: false, code: "ALREADY_OPEN" });
  });

  it("rejects requests after the window closes (server-side, AC1)", async () => {
    const now = new Date();
    const order = await shopOrder("FULFILLED", new Date(now.getTime() - 7 * DAY - 1000));
    expect(await createRepairRequest(prisma, customer, input("ORDER", order.id), now, 7)).toEqual({
      ok: false,
      code: "WINDOW_CLOSED",
    });
  });

  it("only the owner, and only for handed-over orders", async () => {
    const now = new Date();
    const fulfilled = await shopOrder("FULFILLED", now);
    const paid = await shopOrder("PAID", null);
    const ready = await customOrder("READY", null);
    expect(
      await createRepairRequest(prisma, stranger, input("ORDER", fulfilled.id), now, 7),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await createRepairRequest(prisma, customer, input("ORDER", paid.id), now, 7)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await createRepairRequest(prisma, customer, input("CUSTOM_ORDER", ready.id), now, 7),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await getRepairTarget(prisma, stranger, "ORDER", fulfilled.id)).toBeNull();
  });
});

describe("updateRepairRequest (AC3)", () => {
  async function newRepair() {
    const order = await shopOrder("FULFILLED", new Date());
    const r = await createRepairRequest(prisma, customer, input("ORDER", order.id), new Date(), 7);
    if (!r.ok) throw new Error("setup");
    return r.repairId;
  }

  it("moves OPEN → IN_REPAIR → RESOLVED and stamps resolvedAt", async () => {
    const id = await newRepair();
    const now = new Date();
    expect(
      await updateRepairRequest(
        prisma,
        { repairId: id, to: "IN_REPAIR", adminNotes: "Collect Friday" },
        now,
      ),
    ).toEqual({ ok: true, changed: true, status: "IN_REPAIR" });
    expect(await updateRepairRequest(prisma, { repairId: id, to: "RESOLVED" }, now)).toEqual({
      ok: true,
      changed: true,
      status: "RESOLVED",
    });
    const repair = await prisma.repairRequest.findUniqueOrThrow({ where: { id } });
    expect(repair.resolvedAt).toEqual(now);
    expect(await updateRepairRequest(prisma, { repairId: id, to: "IN_REPAIR" }, now)).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
      from: "RESOLVED",
    });
  });

  it("rejects with a reason shown to the customer; notes stay private", async () => {
    const id = await newRepair();
    await updateRepairRequest(
      prisma,
      {
        repairId: id,
        to: "REJECTED",
        rejectionReason: "Damage after handover",
        adminNotes: "Wine stain",
      },
      new Date(),
    );
    const mine = (await listUserRepairs(prisma, customer)).find((r) => r.id === id)!;
    expect(mine).toMatchObject({ status: "REJECTED", rejectionReason: "Damage after handover" });
    expect(mine).not.toHaveProperty("adminNotes");
    const adminView = (await listAdminRepairs(prisma, "REJECTED")).find((r) => r.id === id)!;
    expect(adminView.adminNotes).toBe("Wine stain");
  });

  it("refuses skipping a step; same status just saves notes", async () => {
    const id = await newRepair();
    expect(await updateRepairRequest(prisma, { repairId: id, to: "RESOLVED" }, new Date())).toEqual(
      { ok: false, code: "INVALID_TRANSITION", from: "OPEN" },
    );
    expect(
      await updateRepairRequest(
        prisma,
        { repairId: id, to: "OPEN", adminNotes: "Called her" },
        new Date(),
      ),
    ).toEqual({ ok: true, changed: false, status: "OPEN" });
    expect((await prisma.repairRequest.findUniqueOrThrow({ where: { id } })).adminNotes).toBe(
      "Called her",
    );
    expect(
      await updateRepairRequest(prisma, { repairId: "missing", to: "IN_REPAIR" }, new Date()),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("lists active repairs first for the admin", async () => {
    await newRepair();
    const statuses = (await listAdminRepairs(prisma)).map((r) => r.status);
    const firstClosed = statuses.findIndex((s) => s === "RESOLVED" || s === "REJECTED");
    expect(statuses.slice(firstClosed).every((s) => s === "RESOLVED" || s === "REJECTED")).toBe(
      true,
    );
  });
});

describe("repair Server Actions", () => {
  const fd = (fields: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields))
      for (const value of Array.isArray(v) ? v : [v]) f.append(k, value);
    return f;
  };

  it("createRepairRequest: signed-in owner only, then redirects to My Wardrobe and emails", async () => {
    const { createRepairRequest: action } = await import("@/server/actions/repairs");
    const order = await shopOrder("FULFILLED", new Date());
    const fields = {
      kind: "ORDER",
      targetId: order.id,
      description: "A button fell off straight away.",
      photoUrls: ["https://abc.public.blob.vercel-storage.com/repairs/x/1.jpg"],
    };

    mockAuth.mockResolvedValue(null);
    expect(await action(null, fd(fields))).toEqual({
      ok: false,
      formError: "Please sign in to report a defect.",
    });

    mockAuth.mockResolvedValue({ user: { id: stranger } });
    expect(await action(null, fd(fields))).toEqual({
      ok: false,
      formError: "We couldn't find that order in your wardrobe.",
    });

    mockAuth.mockResolvedValue({ user: { id: customer } });
    expect(await action(null, fd({ ...fields, description: "bad" }))).toMatchObject({
      ok: false,
      fieldErrors: { description: expect.stringMatching(/10 characters/) },
    });

    mockAfter.mockClear();
    await expect(action(null, fd(fields))).rejects.toMatchObject({
      url: "/account/wardrobe?repair=reported#repairs",
    });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    const repair = await prisma.repairRequest.findFirstOrThrow({ where: { orderId: order.id } });
    expect(repair.photoUrls).toEqual(fields.photoUrls);
  });

  it("updateRepairRequest: admins only, reason required to reject", async () => {
    const { updateRepairRequest: action } = await import("@/server/actions/admin/repairs");
    const order = await shopOrder("FULFILLED", new Date());
    const r = await createRepairRequest(prisma, customer, input("ORDER", order.id), new Date(), 7);
    const repairId = r.ok ? r.repairId : "";

    mockAuth.mockResolvedValue({ user: { id: customer } });
    expect(await action(null, fd({ repairId, to: "IN_REPAIR" }))).toEqual({
      ok: false,
      formError: "You don't have access to do that.",
    });

    mockAuth.mockResolvedValue({ user: { id: admin } });
    expect(await action(null, fd({ repairId, to: "REJECTED" }))).toEqual({
      ok: false,
      fieldErrors: { rejectionReason: REJECTION_REASON_REQUIRED },
    });
    expect(await action(null, fd({ repairId, to: "RESOLVED" }))).toEqual({
      ok: false,
      formError: "A repair that is received can't move to repaired.",
    });

    mockAfter.mockClear();
    expect(await action(null, fd({ repairId, to: "IN_REPAIR" }))).toEqual({
      ok: true,
      message: "Moved to In repair. The customer has been emailed.",
    });
    expect(mockAfter).toHaveBeenCalledTimes(1);
    mockAfter.mockClear();
    expect(await action(null, fd({ repairId, to: "IN_REPAIR", adminNotes: "x" }))).toEqual({
      ok: true,
      message: "Notes saved.",
    });
    expect(mockAfter).not.toHaveBeenCalled();
  });
});
