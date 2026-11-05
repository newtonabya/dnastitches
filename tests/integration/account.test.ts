import {
  createAddress,
  deleteAddress,
  getAccountProfile,
  setDefaultAddress,
  updateProfile,
} from "@/server/data/account";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const prisma = createTestPrisma();
const prefix = uid("account");
let alice = "";
let bob = "";

const address = (label: string, isDefault = false) => ({
  recipientName: `Recipient ${label}`,
  phone: "+2348031234567",
  line1: `${label} Admiralty Way`,
  line2: undefined,
  city: "Lekki",
  state: "Lagos" as const,
  landmark: undefined,
  isDefault,
});

beforeAll(async () => {
  alice = (await prisma.user.create({ data: { email: `${prefix}-alice@example.com` } })).id;
  bob = (await prisma.user.create({ data: { email: `${prefix}-bob@example.com` } })).id;
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { userId: { in: [alice, bob] } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.address.deleteMany({ where: { userId: { in: [alice, bob] } } });
  await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
  await prisma.$disconnect();
});

const defaults = async (userId: string) =>
  (await prisma.address.findMany({ where: { userId, isDefault: true }, select: { id: true } })).map(
    (a) => a.id,
  );

describe("account data (US-E1 AC4)", () => {
  it("updates name and phone", async () => {
    await updateProfile(prisma, alice, {
      name: "Alice",
      phone: "+2348031234567",
      smsReminders: true,
    });
    expect(await getAccountProfile(prisma, alice)).toMatchObject({
      name: "Alice",
      phone: "+2348031234567",
      smsReminders: true,
      addresses: [],
    });
    await updateProfile(prisma, alice, { name: "Alice", smsReminders: false });
    expect((await getAccountProfile(prisma, alice))?.phone).toBeNull();
  });

  it("first address becomes default; a new default unsets the previous one", async () => {
    const first = await createAddress(prisma, alice, address("1"));
    expect(await defaults(alice)).toEqual([first.id]);
    const second = await createAddress(prisma, alice, address("2"));
    expect(await defaults(alice)).toEqual([first.id]);
    const third = await createAddress(prisma, alice, address("3", true));
    expect(await defaults(alice)).toEqual([third.id]);
    expect(await setDefaultAddress(prisma, alice, second.id)).toBe(true);
    expect(await defaults(alice)).toEqual([second.id]);
  });

  it("deleting the default promotes the newest remaining address", async () => {
    const [current] = await defaults(alice);
    expect(await deleteAddress(prisma, alice, current!)).toEqual({ ok: true });
    const remaining = await defaults(alice);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).not.toBe(current);
  });

  it("refuses to delete an address used by an order", async () => {
    const addr = await createAddress(prisma, bob, address("order"));
    const product = await prisma.product.create({
      data: {
        slug: `${prefix}-p`,
        name: "P",
        description: "x",
        priceKobo: 100,
        fabricComposition: "x",
        careInstructions: "x",
      },
    });
    await prisma.order.create({
      data: {
        userId: bob,
        productId: product.id,
        subtotalKobo: 100,
        totalKobo: 100,
        fulfillmentMethod: "DELIVERY",
        addressId: addr.id,
        finalSaleAcknowledgedAt: new Date(),
      },
    });
    expect(await deleteAddress(prisma, bob, addr.id)).toEqual({ ok: false, reason: "IN_USE" });
  });

  it("never lets one user change another user's addresses", async () => {
    const [aliceAddress] = await defaults(alice);
    expect(await setDefaultAddress(prisma, bob, aliceAddress!)).toBe(false);
    expect(await deleteAddress(prisma, bob, aliceAddress!)).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(await prisma.address.findUnique({ where: { id: aliceAddress! } })).not.toBeNull();
  });
});

describe("account actions", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };

  it("rejects signed-out callers", async () => {
    const actions = await import("@/server/actions/account");
    mockAuth.mockResolvedValue(null);
    const signedOut = { ok: false, formError: "Please sign in again." };
    expect(await actions.updateProfileAction(null, form({ name: "X" }))).toEqual(signedOut);
    expect(await actions.createAddressAction(null, form({}))).toEqual(signedOut);
    expect(await actions.setDefaultAddressAction(null, form({ addressId: "x" }))).toEqual(
      signedOut,
    );
    expect(await actions.deleteAddressAction(null, form({ addressId: "x" }))).toEqual(signedOut);
  });

  it("validates and saves the profile for the session user", async () => {
    const { updateProfileAction } = await import("@/server/actions/account");
    mockAuth.mockResolvedValue({ user: { id: bob, role: "CUSTOMER" } });
    expect(await updateProfileAction(null, form({ name: "", phone: "123" }))).toMatchObject({
      ok: false,
      fieldErrors: { name: "Name is required", phone: expect.stringContaining("Nigerian") },
    });
    expect(await updateProfileAction(null, form({ name: "Bob", phone: "0803 123 4567" }))).toEqual({
      ok: true,
      message: "Profile saved.",
    });
    expect(
      await prisma.user.findUnique({ where: { id: bob }, select: { name: true, phone: true } }),
    ).toEqual({
      name: "Bob",
      phone: "+2348031234567",
    });
  });

  it("creates an address from form data and blocks cross-user deletes", async () => {
    const { createAddressAction, deleteAddressAction } = await import("@/server/actions/account");
    mockAuth.mockResolvedValue({ user: { id: bob, role: "CUSTOMER" } });
    expect(
      await createAddressAction(
        null,
        form({
          recipientName: "Bob",
          phone: "08031234567",
          line1: "1 Road",
          city: "Ikeja",
          state: "Lagos",
          isDefault: "on",
        }),
      ),
    ).toEqual({ ok: true, message: "Address added." });

    const [aliceAddress] = await defaults(alice);
    expect(await deleteAddressAction(null, form({ addressId: aliceAddress! }))).toEqual({
      ok: false,
      formError: "Address not found.",
    });
  });
});
