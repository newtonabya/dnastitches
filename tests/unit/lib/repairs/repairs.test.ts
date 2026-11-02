import { repairReportedOwnerEmail, repairStatusEmail } from "@/emails/repairs";
import {
  REPAIR_STATUS_LABELS,
  REPAIR_TRANSITIONS,
  canTransitionRepair,
  defectWindowEndsAt,
  isWithinDefectWindow,
} from "@/lib/repairs";
import { repairUploadPrefix } from "@/lib/uploads";
import {
  REJECTION_REASON_REQUIRED,
  repairRequestSchema,
  repairUpdateSchema,
} from "@/lib/validators/repairs";

const handover = new Date("2026-11-01T10:00:00Z");
const after = (ms: number) => new Date(handover.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;
const blob = (n: number) => `https://abc.public.blob.vercel-storage.com/repairs/u/${n}.jpg`;

describe("isWithinDefectWindow (US-D3 DoD)", () => {
  it("is open from handover until exactly 7 days later, inclusive", () => {
    expect(isWithinDefectWindow(handover, handover)).toBe(true);
    expect(isWithinDefectWindow(handover, after(3 * DAY))).toBe(true);
    expect(isWithinDefectWindow(handover, after(7 * DAY))).toBe(true);
    expect(isWithinDefectWindow(handover, after(7 * DAY + 1))).toBe(false);
  });

  it("is closed before handover and when there is no handover date", () => {
    expect(isWithinDefectWindow(handover, after(-1))).toBe(false);
    expect(isWithinDefectWindow(null, handover)).toBe(false);
    expect(isWithinDefectWindow(undefined, handover)).toBe(false);
  });

  it("honours a configured window (REPAIR_WINDOW_DAYS)", () => {
    expect(isWithinDefectWindow(handover, after(10 * DAY), 14)).toBe(true);
    expect(isWithinDefectWindow(handover, after(2 * DAY), 1)).toBe(false);
    expect(defectWindowEndsAt(handover, 1)).toEqual(after(DAY));
    expect(defectWindowEndsAt(handover)).toEqual(after(7 * DAY));
  });
});

describe("repair transitions (AC3)", () => {
  it("allows OPEN → IN_REPAIR → RESOLVED and rejection from OPEN or IN_REPAIR", () => {
    expect(canTransitionRepair("OPEN", "IN_REPAIR")).toBe(true);
    expect(canTransitionRepair("IN_REPAIR", "RESOLVED")).toBe(true);
    expect(canTransitionRepair("OPEN", "REJECTED")).toBe(true);
    expect(canTransitionRepair("IN_REPAIR", "REJECTED")).toBe(true);
  });

  it("refuses skipping, going back, and leaving a closed repair", () => {
    expect(canTransitionRepair("OPEN", "RESOLVED")).toBe(false);
    expect(canTransitionRepair("IN_REPAIR", "OPEN")).toBe(false);
    expect(REPAIR_TRANSITIONS.RESOLVED).toEqual([]);
    expect(REPAIR_TRANSITIONS.REJECTED).toEqual([]);
  });
});

describe("repairRequestSchema (AC2)", () => {
  const base = { kind: "ORDER", targetId: "o1", description: "The seam split on day two." };

  it("accepts a description with up to 3 uploaded photos", () => {
    const parsed = repairRequestSchema.parse({ ...base, photoUrls: [blob(1), blob(2), blob(3)] });
    expect(parsed.photoUrls).toHaveLength(3);
    expect(repairRequestSchema.parse({ ...base, photoUrls: blob(1) }).photoUrls).toEqual([blob(1)]);
    expect(repairRequestSchema.parse(base).photoUrls).toEqual([]);
  });

  it("rejects more than 3 photos, foreign URLs, short descriptions and unknown kinds", () => {
    const issues = (v: unknown) =>
      repairRequestSchema.safeParse(v).error?.issues.map((i) => i.message) ?? [];
    expect(issues({ ...base, photoUrls: [1, 2, 3, 4].map(blob) })).toContain(
      "You can add up to 3 photos",
    );
    expect(issues({ ...base, photoUrls: ["https://evil.example/x.jpg"] })).toContain(
      "Photos must be uploaded through the form",
    );
    expect(issues({ ...base, description: "torn" })[0]).toMatch(/at least 10 characters/);
    expect(issues({ ...base, kind: "PAYMENT" })).toContain("Unknown order type");
  });
});

describe("repairUpdateSchema (AC3)", () => {
  it("requires a reason to reject", () => {
    const r = repairUpdateSchema.safeParse({
      repairId: "r1",
      to: "REJECTED",
      rejectionReason: " ",
    });
    expect(r.error?.issues[0]).toMatchObject({
      path: ["rejectionReason"],
      message: REJECTION_REASON_REQUIRED,
    });
    expect(
      repairUpdateSchema.parse({ repairId: "r1", to: "REJECTED", rejectionReason: "Water damage" })
        .rejectionReason,
    ).toBe("Water damage");
  });

  it("treats blank notes as absent", () => {
    expect(repairUpdateSchema.parse({ repairId: "r1", to: "IN_REPAIR", adminNotes: "" })).toEqual({
      repairId: "r1",
      to: "IN_REPAIR",
    });
  });
});

describe("repair emails", () => {
  const data = {
    repairId: "r1",
    status: "OPEN" as const,
    description: "Seam <split>",
    photoCount: 1,
    rejectionReason: null,
    customerName: "Ada",
    customerEmail: "ada@example.com",
    item: "Adire Wrap Dress",
    siteUrl: "https://dna.example",
  };

  it("tells the owner about a new report, escaping HTML", () => {
    const email = repairReportedOwnerEmail(["owner@example.com"], data);
    expect(email.subject).toBe("Defect reported: Adire Wrap Dress");
    expect(email.text).toContain("1 photo attached.");
    expect(email.text).toContain("https://dna.example/admin/repairs");
    expect(email.html).toContain("Seam &lt;split&gt;");
  });

  it("confirms receipt, then reports each status with the rejection reason", () => {
    expect(repairStatusEmail(data).subject).toBe(
      "We've received your repair request: Adire Wrap Dress",
    );
    const rejected = repairStatusEmail({
      ...data,
      status: "REJECTED",
      rejectionReason: "Damage after handover",
      customerName: null,
    });
    expect(rejected.subject).toBe(`Repair update: ${REPAIR_STATUS_LABELS.REJECTED}`);
    expect(rejected.text).toContain("Reason: Damage after handover");
    expect(rejected.text).toContain("Hi there,");
    expect(repairStatusEmail({ ...data, status: "IN_REPAIR" }).text).toContain("In repair");
  });
});

it("namespaces repair photos per user", () => {
  expect(repairUploadPrefix("u1")).toBe("repairs/u1");
});
