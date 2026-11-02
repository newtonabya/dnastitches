import { fieldErrors } from "@/lib/validators/fields";
import {
  fulfilmentStepSchema,
  makeCustomOrderRequestSchema,
  makeDesignStepSchema,
  measurementStepSchema,
} from "@/lib/validators/custom-order";

const lead = {
  now: () => new Date("2026-11-02T10:00:00Z"),
  minLeadTimeDays: 14,
  timeZone: "Africa/Lagos",
};
const design = makeDesignStepSchema(lead);
const request = makeCustomOrderRequestSchema(lead);

const validDesign = {
  title: "Custom version of Adire Maxi Skirt",
  description: "Same cut, ankle length please.",
};

describe("design step (US-B1 step 1)", () => {
  it("accepts a minimal design and defaults reference images", () => {
    expect(design.parse(validDesign)).toMatchObject({ ...validDesign, referenceImageUrls: [] });
  });

  it.each([
    [{ title: "" }, "title", "Title is required"],
    [{ description: "short" }, "description", "Tell us a little more (at least 10 characters)"],
    [
      { targetDate: "2026-11-15" },
      "targetDate",
      "We need at least 14 days. Choose 16 November 2026 or later.",
    ],
    [{ targetDate: "2026-02-31" }, "targetDate", "Enter a valid date"],
    [{ budgetNaira: "0" }, "budgetNaira", "Budget must be more than ₦0"],
    [{ budgetNaira: "lots" }, "budgetNaira", "Budget must be a number"],
    [
      { referenceImageUrls: ["http://x.example/a.jpg"] },
      "referenceImageUrls.0",
      "Invalid image link",
    ],
    [
      { referenceImageUrls: Array(6).fill("https://x.example/a.jpg") },
      "referenceImageUrls",
      "Up to 5 reference images",
    ],
  ])("rejects %j", (patch, field, message) => {
    const result = design.safeParse({ ...validDesign, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)[field]).toBe(message);
  });

  it("accepts a target date exactly at the lead time and a comma-formatted budget", () => {
    expect(
      design.parse({ ...validDesign, targetDate: "2026-11-16", budgetNaira: "250,000" }),
    ).toMatchObject({
      targetDate: "2026-11-16",
      budgetNaira: 250000,
    });
  });
});

describe("measurement step (US-B1 step 3)", () => {
  it.each([
    [{ mode: "existing", profileId: "mp_1" }],
    [{ mode: "appointment" }],
    [{ mode: "new", profile: { label: "Me", unit: "CM", bust: 90, waist: 70, hips: 98 } }],
  ])("accepts %j", (value) => {
    expect(measurementStepSchema.safeParse(value).success).toBe(true);
  });

  it("rejects missing choices and invalid new profiles", () => {
    expect(measurementStepSchema.safeParse({}).success).toBe(false);
    expect(measurementStepSchema.safeParse({ mode: "existing", profileId: "" }).success).toBe(
      false,
    );
    const result = measurementStepSchema.safeParse({
      mode: "new",
      profile: { label: "Me", unit: "CM", bust: 90, waist: 10, hips: 98 },
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error)["profile.waist"]).toMatch(/looks unusual/);
  });
});

describe("fulfilment", () => {
  it("delivery needs an address; pickup drops it", () => {
    const result = fulfilmentStepSchema.safeParse({ fulfillmentMethod: "DELIVERY", addressId: "" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error).addressId).toBe("Choose a delivery address");
    expect(fulfilmentStepSchema.parse({ fulfillmentMethod: "PICKUP", addressId: "a1" })).toEqual({
      fulfillmentMethod: "PICKUP",
    });
    expect(fulfilmentStepSchema.parse({ fulfillmentMethod: "DELIVERY", addressId: "a1" })).toEqual({
      fulfillmentMethod: "DELIVERY",
      addressId: "a1",
    });
  });
});

describe("full request", () => {
  it("converts budget naira to kobo and keeps the source", () => {
    const parsed = request.parse({
      design: { ...validDesign, budgetNaira: "150000.5" },
      fabric: { fabricSwatchId: null },
      measurements: { mode: "appointment" },
      fulfilment: { fulfillmentMethod: "PICKUP" },
      source: { fromProductId: "p1" },
    });
    expect(parsed.design.budgetKobo).toBe(15_000_050);
    expect(parsed.design).not.toHaveProperty("budgetNaira");
    expect(parsed.fabric.fabricSwatchId).toBeNull();
    expect(parsed.source).toEqual({ fromProductId: "p1" });
  });

  it("reports errors by step path", () => {
    const result = request.safeParse({ design: {}, fabric: {}, measurements: {}, fulfilment: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error))).toEqual(
        expect.arrayContaining([
          "design.title",
          "design.description",
          "fabric.fabricSwatchId",
          "measurements.mode",
          "fulfilment.fulfillmentMethod",
        ]),
      );
    }
  });
});
