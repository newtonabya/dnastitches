import { z } from "zod";

import { nairaToKobo } from "@/lib/money";
import { NIGERIAN_STATES } from "@/lib/nigeria";

import { checkbox, optionalText, requiredText } from "./fields";

/** Shared admin catalog schemas (US-C3 DoD: all forms use shared Zod schemas). */

const blankToUndefined = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v;

const nairaToKoboField = (label: string) =>
  z.preprocess(
    (v) => {
      const b = blankToUndefined(v);
      return typeof b === "string" ? Number(b.replace(/,/g, "")) : b;
    },
    z
      .number({
        error: (i) =>
          i.input === undefined ? `${label} is required` : `${label} must be a number`,
      })
      .finite()
      .min(0, `${label} can't be negative`)
      .max(100_000_000, `${label} looks too high`)
      .transform(nairaToKobo),
  );

const intField = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => {
      const b = blankToUndefined(v);
      return typeof b === "string" ? Number(b) : b;
    },
    z
      .number({
        error: (i) =>
          i.input === undefined ? `${label} is required` : `${label} must be a whole number`,
      })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`),
  );

const cmField = (label: string) =>
  z.preprocess(
    (v) => {
      const b = blankToUndefined(v);
      return typeof b === "string" ? Number(b) : b;
    },
    z
      .number({ error: `${label} must be a number` })
      .positive(`${label} must be more than 0`)
      .max(500, `${label} looks too large`)
      .transform((n) => Math.round(n * 10) / 10)
      .optional(),
  );

/** An uploaded image (https), or one of the bundled demo images under /demo/ (Admin → Settings). */
const httpsUrl = z.union(
  [z.url({ protocol: /^https$/ }), z.string().regex(/^\/demo\/[a-z0-9-]+\.(?:jpg|png|webp)$/)],
  { error: "Image must be an https URL" },
);

export const productImageSchema = z.object({
  url: httpsUrl,
  alt: z.string().trim().min(1, "Describe each image (alt text)").max(200),
});

/** Images arrive as a JSON string from the form's ordered image list. */
const imagesField = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v ?? [];
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  },
  z.array(productImageSchema, { error: "Invalid image list" }).max(12, "Up to 12 images"),
);

export const productSchema = z.object({
  name: requiredText("Name", 120),
  description: z.string().trim().min(1, "Description is required").max(5000),
  priceNaira: nairaToKoboField("Price"),
  quantity: intField("Quantity", 0, 1000),
  sizeLabel: optionalText("Size label", 40),
  bustCm: cmField("Bust"),
  waistCm: cmField("Waist"),
  hipsCm: cmField("Hips"),
  lengthCm: cmField("Length"),
  fabricComposition: requiredText("Fabric composition", 300),
  careInstructions: z.string().trim().min(1, "Care instructions are required").max(2000),
  fabricSwatchId: z.preprocess(blankToUndefined, z.string().max(64).optional()),
  isPublished: checkbox,
  /** On edit: regenerate the slug from the (new) name. Off by default (AC3). */
  regenerateSlug: checkbox,
  images: imagesField,
});

export type ProductInput = z.output<typeof productSchema>;

export const swatchSchema = z.object({
  name: requiredText("Name", 80),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #2E3A87")
    .transform((v) => v.toUpperCase()),
  imageUrl: httpsUrl,
  composition: requiredText("Composition", 200),
  isAvailable: checkbox,
  sortOrder: intField("Sort order", 0, 10_000).optional().default(0),
});

export type SwatchInput = z.output<typeof swatchSchema>;

export const portfolioSchema = z.object({
  title: requiredText("Title", 120),
  description: z.string().trim().min(1, "Description is required").max(2000),
  imageUrl: httpsUrl,
  tags: z
    .string()
    .optional()
    .default("")
    .transform((v) => [
      ...new Set(
        v
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z.array(z.string().max(30, "Tags must be at most 30 characters")).max(10, "Up to 10 tags"),
    ),
  isPublished: checkbox,
  sourceProductId: z.preprocess(blankToUndefined, z.string().max(64).optional()),
});

export type PortfolioInput = z.output<typeof portfolioSchema>;

export const deliveryZoneSchema = z.object({
  name: requiredText("Name", 80),
  states: z
    .array(z.enum(NIGERIAN_STATES, { error: "Unknown state" }))
    .min(1, "Choose at least one state")
    .transform((s) => [...new Set(s)]),
  feeNaira: nairaToKoboField("Fee"),
  etaDays: intField("Delivery time", 0, 60),
  isActive: checkbox,
});

export type DeliveryZoneInput = z.output<typeof deliveryZoneSchema>;

export const idSchema = z.string().trim().min(1).max(64);
