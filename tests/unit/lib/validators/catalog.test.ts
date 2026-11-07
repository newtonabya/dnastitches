import {
  deliveryZoneSchema,
  portfolioSchema,
  productSchema,
  swatchSchema,
} from "@/lib/validators/catalog";
import { fieldErrors } from "@/lib/validators/fields";

const product = {
  name: "Adire Wrap Dress",
  description: "A 1-of-1 wrap dress.",
  priceNaira: "185,000",
  quantity: "1",
  fabricComposition: "Cotton",
  careInstructions: "Dry clean only.",
  images: JSON.stringify([{ url: "https://x.public.blob.vercel-storage.com/a.jpg", alt: "Front" }]),
};

describe("productSchema (US-C3)", () => {
  it("parses money, quantity, optional measurements and the image list", () => {
    expect(
      productSchema.parse({ ...product, bustCm: "88.25", waistCm: "", isPublished: "on" }),
    ).toEqual({
      name: "Adire Wrap Dress",
      description: "A 1-of-1 wrap dress.",
      priceNaira: 18_500_000,
      quantity: 1,
      sizeLabel: undefined,
      bustCm: 88.3,
      waistCm: undefined,
      hipsCm: undefined,
      lengthCm: undefined,
      fabricComposition: "Cotton",
      careInstructions: "Dry clean only.",
      fabricSwatchId: undefined,
      isPublished: true,
      regenerateSlug: false,
      images: [{ url: "https://x.public.blob.vercel-storage.com/a.jpg", alt: "Front" }],
    });
  });

  it.each([
    [{ name: "" }, "name", "Name is required"],
    [{ priceNaira: "" }, "priceNaira", "Price is required"],
    [{ priceNaira: "-1" }, "priceNaira", "Price can't be negative"],
    [{ quantity: "1.5" }, "quantity", "Quantity must be a whole number"],
    [{ quantity: "-1" }, "quantity", "Quantity must be at least 0"],
    [{ bustCm: "0" }, "bustCm", "Bust must be more than 0"],
    [{ images: "not json" }, "images", "Invalid image list"],
    [
      { images: JSON.stringify([{ url: "http://x/a.jpg", alt: "a" }]) },
      "images.0.url",
      "Image must be an https URL",
    ],
    [
      { images: JSON.stringify([{ url: "/demo/../secret.jpg", alt: "a" }]) },
      "images.0.url",
      "Image must be an https URL",
    ],
    [
      { images: JSON.stringify([{ url: "https://x/a.jpg", alt: "" }]) },
      "images.0.alt",
      "Describe each image (alt text)",
    ],
  ])("rejects %j", (patch, field, message) => {
    const r = productSchema.safeParse({ ...product, ...patch });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)[field]).toBe(message);
  });
});

it("accepts the bundled demo images (Admin → Settings → Demo content)", () => {
  const r = productSchema.safeParse({
    ...product,
    images: JSON.stringify([{ url: "/demo/product-onyx-jumpsuit.jpg", alt: "Jumpsuit" }]),
  });
  expect(r.success).toBe(true);
});

describe("swatchSchema", () => {
  it("normalises the hex colour and defaults sort order", () => {
    expect(
      swatchSchema.parse({
        name: "Indigo",
        colorHex: "#2e3a87",
        imageUrl: "https://x/a.png",
        composition: "Cotton",
        isAvailable: "on",
      }),
    ).toEqual({
      name: "Indigo",
      colorHex: "#2E3A87",
      imageUrl: "https://x/a.png",
      composition: "Cotton",
      isAvailable: true,
      sortOrder: 0,
    });
  });
  it("rejects bad colours", () => {
    expect(
      swatchSchema.safeParse({
        name: "x",
        colorHex: "blue",
        imageUrl: "https://x/a.png",
        composition: "x",
      }).success,
    ).toBe(false);
  });
});

describe("portfolioSchema", () => {
  it("splits, trims, lowercases and de-duplicates tags", () => {
    expect(
      portfolioSchema.parse({
        title: "Gown",
        description: "x",
        imageUrl: "https://x/a.png",
        tags: "Bridal, silk ,bridal,,",
      }).tags,
    ).toEqual(["bridal", "silk"]);
  });
});

describe("deliveryZoneSchema (D-12)", () => {
  it("parses states, fee and ETA", () => {
    expect(
      deliveryZoneSchema.parse({
        name: "Lagos",
        states: ["Lagos", "Lagos"],
        feeNaira: "3500",
        etaDays: "2",
        isActive: "on",
      }),
    ).toEqual({
      name: "Lagos",
      states: ["Lagos"],
      feeNaira: 350_000,
      etaDays: 2,
      isActive: true,
    });
  });
  it("requires known states", () => {
    const r = deliveryZoneSchema.safeParse({ name: "X", states: [], feeNaira: "1", etaDays: "1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).states).toBe("Choose at least one state");
    expect(
      deliveryZoneSchema.safeParse({ name: "X", states: ["Accra"], feeNaira: "1", etaDays: "1" })
        .success,
    ).toBe(false);
  });
});
