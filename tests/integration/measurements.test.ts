import { measurementProfileSchema } from "@/lib/validators/measurements";
import {
  createProfile,
  createProfileVersion,
  listAllProfileVersions,
  listCurrentProfiles,
  setDefaultProfile,
} from "@/server/data/measurements";

import { createTestPrisma, uid } from "./helpers/db";

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const prisma = createTestPrisma();
const prefix = uid("measure");
let alice = "";
let bob = "";

const profile = (label: string, waist = 70) =>
  measurementProfileSchema.parse({ label, unit: "CM", bust: 90, waist, hips: 98 });

const defaults = async (userId: string) =>
  (
    await prisma.measurementProfile.findMany({
      where: { userId, isDefault: true },
      select: { id: true },
    })
  ).map((p) => p.id);

beforeAll(async () => {
  alice = (await prisma.user.create({ data: { email: `${prefix}-a@example.com` } })).id;
  bob = (await prisma.user.create({ data: { email: `${prefix}-b@example.com` } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
  await prisma.$disconnect();
});

describe("measurement profiles (US-B3)", () => {
  it("first profile is default; makeDefault moves it; exactly one default (AC2)", async () => {
    const a = await createProfile(prisma, alice, profile("A"));
    expect(await defaults(alice)).toEqual([a.id]);
    const b = await createProfile(prisma, alice, profile("B"));
    expect(await defaults(alice)).toEqual([a.id]);
    const c = await createProfile(prisma, alice, profile("C"), { makeDefault: true });
    expect(await defaults(alice)).toEqual([c.id]);
    expect(await setDefaultProfile(prisma, alice, b.id)).toBe(true);
    expect(await defaults(alice)).toEqual([b.id]);
  });

  it("editing creates a new version; the customer sees only the latest, admin sees all (AC3)", async () => {
    const [current] = await defaults(alice);
    const result = await createProfileVersion(prisma, alice, current!, profile("B (updated)", 72));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const visible = await listCurrentProfiles(prisma, alice);
    expect(visible.map((p) => p.label)).toEqual(expect.arrayContaining(["A", "C", "B (updated)"]));
    expect(visible.map((p) => p.label)).not.toContain("B");
    // Default moved to the new version.
    expect(visible[0]).toMatchObject({
      id: result.id,
      isDefault: true,
      waist: 72,
      previousVersionId: current,
    });
    expect(await defaults(alice)).toEqual([result.id]);

    const all = await listAllProfileVersions(prisma, alice);
    expect(all.map((p) => p.label)).toContain("B");
    // A superseded version can't be edited again.
    expect(await createProfileVersion(prisma, alice, current!, profile("again"))).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });

  it("is scoped to the owner", async () => {
    const [aliceDefault] = await defaults(alice);
    expect(await setDefaultProfile(prisma, bob, aliceDefault!)).toBe(false);
    expect(await createProfileVersion(prisma, bob, aliceDefault!, profile("hijack"))).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(await listCurrentProfiles(prisma, bob)).toEqual([]);
  });
});

describe("measurement actions", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };

  it("rejects signed-out callers and implausible values; saves valid ones", async () => {
    const actions = await import("@/server/actions/measurements");
    mockAuth.mockResolvedValue(null);
    expect(await actions.createMeasurementProfileAction(null, form({}))).toEqual({
      ok: false,
      formError: "Please sign in again.",
    });

    mockAuth.mockResolvedValue({ user: { id: bob, role: "CUSTOMER" } });
    const bad = await actions.createMeasurementProfileAction(
      null,
      form({ label: "Me", unit: "CM", bust: "90", waist: "30", hips: "98" }),
    );
    expect(bad).toMatchObject({
      ok: false,
      fieldErrors: { waist: expect.stringMatching(/looks unusual/) },
    });

    expect(
      await actions.createMeasurementProfileAction(
        null,
        form({ label: "Me", unit: "IN", bust: "36", waist: "29", hips: "40" }),
      ),
    ).toEqual({ ok: true, message: "Measurements saved." });
    const [saved] = await listCurrentProfiles(prisma, bob);
    expect(saved).toMatchObject({
      label: "Me",
      unit: "IN",
      bust: 36,
      isDefault: true,
      takenBy: "SELF",
    });

    expect(
      await actions.updateMeasurementProfileAction(
        null,
        form({
          profileId: saved!.id,
          label: "Me v2",
          unit: "IN",
          bust: "36.5",
          waist: "29",
          hips: "40",
        }),
      ),
    ).toEqual({ ok: true, message: "Saved as a new version." });
    expect((await listCurrentProfiles(prisma, bob)).map((p) => p.label)).toEqual(["Me v2"]);
  });
});
