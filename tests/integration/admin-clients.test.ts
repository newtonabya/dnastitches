import { getClientProfile, searchClients } from "@/server/data/admin/clients";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const prisma = createTestPrisma();
const prefix = uid("clients");
let client = "";
let other = "";
let admin = "";

beforeAll(async () => {
  client = (
    await prisma.user.create({
      data: {
        email: `${prefix}-chioma@example.com`,
        name: `Chioma ${prefix}`,
        phone: "+2348091234567",
      },
    })
  ).id;
  other = (
    await prisma.user.create({ data: { email: `${prefix}-other@example.com`, name: "Other" } })
  ).id;
  admin = (
    await prisma.user.create({ data: { email: `${prefix}-admin@example.com`, role: "ADMIN" } })
  ).id;
  await prisma.customOrder.createMany({
    data: [1, 2].map((n) => ({
      reference: `${prefix}-${n}`,
      userId: client,
      title: `Order ${n}`,
      description: "x",
    })),
  });
  const v1 = await prisma.measurementProfile.create({
    data: {
      userId: client,
      label: "Wedding",
      unit: "CM",
      bust: 90,
      waist: 70,
      hips: 98,
      supersededAt: new Date(),
    },
  });
  await prisma.measurementProfile.create({
    data: {
      userId: client,
      label: "Wedding",
      unit: "CM",
      bust: 90,
      waist: 72,
      hips: 98,
      previousVersionId: v1.id,
      isDefault: true,
    },
  });
  await prisma.notificationRequest.create({
    data: { email: `${prefix}-chioma@example.com`, type: "RESTOCK" },
  });
});

afterAll(async () => {
  const ids = [client, other, admin];
  await prisma.notificationRequest.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.customOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("searchClients (US-C2 AC1)", () => {
  it.each([
    [`chioma ${prefix}`.toUpperCase()],
    [`${prefix}-chioma@`],
    ["08091234567"],
    ["+234 809 123 4567"],
    ["8091234567"],
  ])("finds the client by %p", async (q) => {
    const result = await searchClients(prisma, q);
    expect(result.map((c) => c.id)).toEqual([client]);
    expect(result[0]).toMatchObject({ customOrderCount: 2, phone: "+2348091234567" });
  });

  it("never lists admins", async () => {
    expect((await searchClients(prisma, `${prefix}-admin`)).length).toBe(0);
  });
});

describe("getClientProfile (US-C2 AC2)", () => {
  it("aggregates every relation, including all measurement versions newest first", async () => {
    const profile = await getClientProfile(prisma, client);
    expect(profile?.user.email).toBe(`${prefix}-chioma@example.com`);
    expect(profile?.customOrders).toHaveLength(2);
    expect(profile?.measurements.map((m) => m.waist)).toEqual([72, 70]);
    expect(profile?.measurements[0]?.previousVersionId).toBe(profile?.measurements[1]?.id);
    expect(profile?.notificationRequests).toHaveLength(1);
    expect(profile).toMatchObject({
      orders: [],
      payments: [],
      repairRequests: [],
      appointments: [],
    });
  });

  it("returns null for an unknown client", async () => {
    expect(await getClientProfile(prisma, "missing")).toBeNull();
  });
});

describe("recordClientMeasurementAction (US-C2 AC3)", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };
  const measurements = { label: "Fitting 1", unit: "CM", bust: "91", waist: "71", hips: "99" };

  it("is admin-only", async () => {
    const { recordClientMeasurementAction } = await import("@/server/actions/admin/clients");
    mockAuth.mockResolvedValue({ user: { id: other, role: "ADMIN" } });
    expect(
      await recordClientMeasurementAction(null, form({ userId: client, ...measurements })),
    ).toEqual({
      ok: false,
      formError: "You don't have access to do that.",
    });
  });

  it("records a profile marked as taken by the atelier", async () => {
    const { recordClientMeasurementAction } = await import("@/server/actions/admin/clients");
    mockAuth.mockResolvedValue({ user: { id: admin, role: "ADMIN" } });
    expect(
      await recordClientMeasurementAction(
        null,
        form({ userId: client, ...measurements, makeDefault: "on" }),
      ),
    ).toEqual({
      ok: true,
      message: "Measurements recorded.",
    });
    const saved = await prisma.measurementProfile.findFirstOrThrow({
      where: { userId: client, label: "Fitting 1" },
    });
    expect(saved).toMatchObject({ takenBy: "ADMIN", isDefault: true });
    expect(
      await prisma.measurementProfile.count({ where: { userId: client, isDefault: true } }),
    ).toBe(1);
    expect(
      await recordClientMeasurementAction(null, form({ userId: "missing", ...measurements })),
    ).toEqual({
      ok: false,
      formError: "Client not found.",
    });
  });
});
