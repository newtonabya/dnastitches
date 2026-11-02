import { z } from "zod";

import { MeasurementUnit } from "@/generated/prisma/enums";
import { CM_PER_INCH } from "@/lib/units";

import { optionalText, requiredText } from "./fields";

/**
 * Plausible adult human ranges, in centimetres (US-B3 AC5). Defined once here and
 * converted for inches, so the same rules apply whatever unit the customer uses.
 */
export const PLAUSIBLE_RANGES_CM = {
  bust: { min: 50, max: 200 },
  waist: { min: 40, max: 200 },
  hips: { min: 50, max: 220 },
  shoulder: { min: 25, max: 70 },
  armLength: { min: 35, max: 100 },
  inseam: { min: 40, max: 120 },
  height: { min: 100, max: 230 },
} as const;

export type MeasurementField = keyof typeof PLAUSIBLE_RANGES_CM;

export const MEASUREMENT_FIELDS: {
  key: MeasurementField;
  label: string;
  required: boolean;
  howTo: string;
}[] = [
  {
    key: "bust",
    label: "Bust / chest",
    required: true,
    howTo: "Measure around the fullest part of your chest, keeping the tape level under your arms.",
  },
  {
    key: "waist",
    label: "Waist",
    required: true,
    howTo:
      "Measure around your natural waist, the narrowest part of your torso, without pulling tight.",
  },
  {
    key: "hips",
    label: "Hips",
    required: true,
    howTo: "Stand with feet together and measure around the fullest part of your hips and seat.",
  },
  {
    key: "shoulder",
    label: "Shoulder width",
    required: false,
    howTo: "Measure across your back from the tip of one shoulder bone to the other.",
  },
  {
    key: "armLength",
    label: "Arm length",
    required: false,
    howTo:
      "With your arm slightly bent, measure from the shoulder tip over the elbow to the wrist bone.",
  },
  {
    key: "inseam",
    label: "Inseam",
    required: false,
    howTo: "Measure from the top of your inner thigh straight down to the ankle bone.",
  },
  {
    key: "height",
    label: "Height",
    required: false,
    howTo: "Stand barefoot against a wall and measure from the floor to the top of your head.",
  },
];

/** Plausible range for a field in the given unit, rounded to 1 decimal place. */
export function plausibleRange(field: MeasurementField, unit: MeasurementUnit) {
  const { min, max } = PLAUSIBLE_RANGES_CM[field];
  if (unit === "CM") return { min, max };
  return {
    min: Math.round((min / CM_PER_INCH) * 10) / 10,
    max: Math.round((max / CM_PER_INCH) * 10) / 10,
  };
}

const toNumberOrUndefined = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  return s === "" ? undefined : Number(s);
};

const measurementValue = (label: string, required: boolean) => {
  const n = z
    .number({
      error: (issue) =>
        issue.input === undefined ? `${label} is required` : `${label} must be a number`,
    })
    .finite(`${label} must be a number`);
  return z.preprocess(toNumberOrUndefined, required ? n : n.optional());
};

const UNIT_SUFFIX = { CM: "cm", IN: "in" } as const;

/** US-B3 / US-B1 step 3: a measurement profile. Values are stored in the unit entered. */
export const measurementProfileSchema = z
  .object({
    label: requiredText("Label", 60),
    unit: z.enum(MeasurementUnit, { error: "Choose cm or inches" }),
    bust: measurementValue("Bust / chest", true),
    waist: measurementValue("Waist", true),
    hips: measurementValue("Hips", true),
    shoulder: measurementValue("Shoulder width", false),
    armLength: measurementValue("Arm length", false),
    inseam: measurementValue("Inseam", false),
    height: measurementValue("Height", false),
    notes: optionalText("Notes", 500),
  })
  .superRefine((profile, ctx) => {
    for (const { key, label } of MEASUREMENT_FIELDS) {
      const value = profile[key];
      if (value === undefined) continue;
      const { min, max } = plausibleRange(key, profile.unit);
      if (value < min || value > max) {
        const unit = UNIT_SUFFIX[profile.unit];
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${label} looks unusual. Please check it's between ${min} and ${max} ${unit}.`,
        });
      }
    }
  })
  .transform((p) => {
    const round = (v: number | undefined) =>
      v === undefined ? undefined : Math.round(v * 10) / 10;
    return {
      ...p,
      bust: round(p.bust)!,
      waist: round(p.waist)!,
      hips: round(p.hips)!,
      shoulder: round(p.shoulder),
      armLength: round(p.armLength),
      inseam: round(p.inseam),
      height: round(p.height),
    };
  });

export type MeasurementProfileInput = z.input<typeof measurementProfileSchema>;
export type MeasurementProfileData = z.output<typeof measurementProfileSchema>;
