import { claimRestockRequests, releaseRestockClaim } from "@/server/data/restock";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
const mockAfter = jest.fn();
const mockSend = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), updateTag: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/server", () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
jest.mock("@/lib/email", () => ({ getEmailSender: () => ({ send: (m: unknown) => mockSend(m) }) }));

const prisma = createTestPrisma();
const prefix = uid("restock");
const blob = (name: string) => `https://test.public.blob.vercel-storage.com/${prefix}/${name}`;
let admin = "";
let seq = 0;

async function product(state: { quantity: number; isPublished: boolean }) {
  return prisma.product.create({
    data: {
      slug: `${prefix}-${++seq}`,
      name: `Piece ${seq}`,
      description: "x",
      priceKobo: 100_000_00,
      quantity: state.quantity,
      inventoryStatus: state.quantity === 0 ? "SOLD_OUT" : "LOW_STOCK",
      isPublished: state.isPublished,
      fabricComposition: "x",
      careInstructions: "x",
      images: { create: [{ url: blob(`${seq}.jpg`), alt: "Front" }] },
    },
  });
}

async function requests(
  productId: string,
  emails: string[],
  type: "RESTOCK" | "SIMILAR_FABRIC" = "RESTOCK",
) {
  await prisma.notificationRequest.createMany({
    data: emails.map((e) => ({ email: `${e}-${prefix}@example.com`, productId, type })),
  });
}

beforeAll(async () => {
  admin = (
    await prisma.user.create({ data: { email: `${prefix}-admin@example.com`, role: "ADMIN" } })
  ).id;
});

afterAll(async () => {
  await prisma.notificationRequest.deleteMany({ where: { email: { contains: prefix } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: admin } });
  await prisma.$disconnect();
});

describe("claimRestockRequests (US-D4)", () => {
  it("claims pending restock requests only while the piece is published and in stock", async () => {
    const soldOut = await product({ quantity: 0, isPublished: true });
    const hidden = await product({ quantity: 1, isPublished: false });
    await requests(soldOut.id, ["a"]);
    await requests(hidden.id, ["b"]);
    expect(await claimRestockRequests(prisma, soldOut.id, new Date())).toEqual([]);
    expect(await claimRestockRequests(prisma, hidden.id, new Date())).toEqual([]);

    await prisma.product.update({
      where: { id: soldOut.id },
      data: { quantity: 1, inventoryStatus: "LOW_STOCK" },
    });
    const now = new Date();
    const claimed = await claimRestockRequests(prisma, soldOut.id, now);
    expect(claimed.map((c) => c.email)).toEqual([`a-${prefix}@example.com`]);
    expect(
      (await prisma.notificationRequest.findFirstOrThrow({ where: { productId: soldOut.id } }))
        .notifiedAt,
    ).toEqual(now);
    // Already emailed: never again.
    expect(await claimRestockRequests(prisma, soldOut.id, new Date())).toEqual([]);
  });

  it("leaves similar-fabric requests alone", async () => {
    const p = await product({ quantity: 1, isPublished: true });
    await requests(p.id, ["c"], "SIMILAR_FABRIC");
    expect(await claimRestockRequests(prisma, p.id, new Date())).toEqual([]);
  });

  it("concurrent saves claim each request exactly once", async () => {
    const p = await product({ quantity: 1, isPublished: true });
    await requests(p.id, ["d", "e", "f"]);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => claimRestockRequests(prisma, p.id, new Date())),
    );
    expect(
      results
        .flat()
        .map((c) => c.email)
        .sort(),
    ).toEqual(["d", "e", "f"].map((e) => `${e}-${prefix}@example.com`));
  });

  it("a released claim is retried next time", async () => {
    const p = await product({ quantity: 1, isPublished: true });
    await requests(p.id, ["g"]);
    const [claim] = await claimRestockRequests(prisma, p.id, new Date());
    await releaseRestockClaim(prisma, claim!.id);
    expect((await claimRestockRequests(prisma, p.id, new Date())).map((c) => c.id)).toEqual([
      claim!.id,
    ]);
  });
});

describe("updateProductAction restock emails", () => {
  it("emails waiting customers once when a sold-out piece is restocked, retrying failures", async () => {
    const { updateProductAction } = await import("@/server/actions/admin/catalog");
    mockAuth.mockResolvedValue({ user: { id: admin, role: "ADMIN" } });
    const p = await product({ quantity: 0, isPublished: true });
    await requests(p.id, ["h", "i"]);
    const fields = (quantity: string) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({
        productId: p.id,
        name: p.name,
        description: "x",
        priceNaira: "100000",
        quantity,
        fabricComposition: "x",
        careInstructions: "x",
        isPublished: "on",
        images: JSON.stringify([{ url: blob(`${seq}.jpg`), alt: "Front" }]),
      }))
        f.append(k, v);
      return f;
    };

    mockAfter.mockClear();
    expect(await updateProductAction(null, fields("0"))).toEqual({ ok: true, message: "Saved." });
    expect(mockAfter).not.toHaveBeenCalled();

    // Restocked: two people are emailed; one email fails and is released.
    mockSend.mockReset();
    mockSend.mockImplementation(async (m: { to: string }) => {
      if (m.to.startsWith("i-")) throw new Error("Resend responded 500");
    });
    expect(await updateProductAction(null, fields("1"))).toEqual({
      ok: true,
      message: "Saved. Emailing 2 people who asked to hear when it's back.",
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    await (mockAfter.mock.calls.at(-1)![0] as () => Promise<void>)();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0]![0]).toMatchObject({ subject: `It's back: ${p.name}` });

    // The next save retries only the failed one.
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
    expect(await updateProductAction(null, fields("1"))).toEqual({
      ok: true,
      message: "Saved. Emailing 1 person who asked to hear when it's back.",
    });
    await (mockAfter.mock.calls.at(-1)![0] as () => Promise<void>)();
    expect(mockSend.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual([
      `i-${prefix}@example.com`,
    ]);
    expect(await updateProductAction(null, fields("1"))).toEqual({ ok: true, message: "Saved." });
  });
});
