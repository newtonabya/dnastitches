import { z } from "zod";

import { FulfillmentMethod } from "@/generated/prisma/enums";
import {
  isCalendarDate,
  isTargetDateAllowed,
  earliestTargetDate,
} from "@/lib/custom-order/lead-time";
import { nairaToKobo } from "@/lib/money";
import { MAX_REFERENCE_IMAGES } from "@/lib/uploads";

import { optionalText, requiredText } from "./fields";
import { measurementProfileSchema } from "./measurements";

/**
 * US-B1 custom request, one schema per form step (so the client validates each step
 * with exactly the rules the server enforces) composed into the full request.
 */

export interface LeadTimeOptions {
  now: () => Date;
  minLeadTimeDays: number;
  timeZone: string;
}

function formatDisplayDate(date: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

const optionalNumber = (label: string) =>
  z.preprocess(
    (v) =>
      v === undefined || v === null || (typeof v === "string" && v.trim() === "")
        ? undefined
        : Number(String(v).replace(/,/g, "")),
    z
      .number({ error: `${label} must be a number` })
      .finite(`${label} must be a number`)
      .optional(),
  );

export function makeDesignStepSchema(lead: LeadTimeOptions) {
  return z.object({
    title: requiredText("Title", 120),
    description: z
      .string({ error: "Description is required" })
      .trim()
      .min(10, "Tell us a little more (at least 10 characters)")
      .max(4000, "Description must be at most 4000 characters"),
    occasion: optionalText("Occasion", 120),
    targetDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .superRefine((v, ctx) => {
        if (v === undefined) return;
        if (!isCalendarDate(v)) {
          ctx.addIssue({ code: "custom", message: "Enter a valid date" });
          return;
        }
        const now = lead.now();
        if (!isTargetDateAllowed(v, now, lead.minLeadTimeDays, lead.timeZone)) {
          const earliest = earliestTargetDate(now, lead.minLeadTimeDays, lead.timeZone);
          ctx.addIssue({
            code: "custom",
            message: `We need at least ${lead.minLeadTimeDays} days. Choose ${formatDisplayDate(earliest)} or later.`,
          });
        }
      }),
    budgetNaira: optionalNumber("Budget")
      .refine((v) => v === undefined || v > 0, "Budget must be more than ₦0")
      .refine((v) => v === undefined || v <= 100_000_000, "Budget looks too high"),
    referenceImageUrls: z
      .array(z.url({ protocol: /^https$/, error: "Invalid image link" }))
      .max(MAX_REFERENCE_IMAGES, `Up to ${MAX_REFERENCE_IMAGES} reference images`)
      .default([]),
  });
}

/** `null` means "Not sure — advise me". */
export const fabricStepSchema = z.object({
  fabricSwatchId: z.string().trim().min(1).max(64).nullable(),
});

export const measurementStepSchema = z.discriminatedUnion(
  "mode",
  [
    z.object({
      mode: z.literal("existing"),
      profileId: z.string().min(1, "Choose a saved profile").max(64),
    }),
    z.object({ mode: z.literal("new"), profile: measurementProfileSchema }),
    z.object({ mode: z.literal("appointment") }),
  ],
  { error: "Choose how you'd like to give your measurements" },
);

export const fulfilmentStepSchema = z
  .object({
    fulfillmentMethod: z.enum(FulfillmentMethod, { error: "Choose pickup or delivery" }),
    addressId: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillmentMethod === "DELIVERY" && !v.addressId) {
      ctx.addIssue({ code: "custom", path: ["addressId"], message: "Choose a delivery address" });
    }
  })
  .transform((v) =>
    v.fulfillmentMethod === "PICKUP" ? { fulfillmentMethod: v.fulfillmentMethod } : v,
  );

export const sourceSchema = z
  .object({
    fromProductId: z.string().trim().min(1).max(64).optional(),
    fromPortfolioId: z.string().trim().min(1).max(64).optional(),
  })
  .default({});

export function makeCustomOrderRequestSchema(lead: LeadTimeOptions) {
  return z
    .object({
      design: makeDesignStepSchema(lead),
      fabric: fabricStepSchema,
      measurements: measurementStepSchema,
      fulfilment: fulfilmentStepSchema,
      source: sourceSchema,
    })
    .transform(({ design, ...rest }) => {
      const { budgetNaira, ...designRest } = design;
      return {
        ...rest,
        design: {
          ...designRest,
          budgetKobo: budgetNaira === undefined ? undefined : nairaToKobo(budgetNaira),
        },
      };
    });
}

export type CustomOrderRequestInput = z.input<ReturnType<typeof makeCustomOrderRequestSchema>>;
export type CustomOrderRequest = z.output<ReturnType<typeof makeCustomOrderRequestSchema>>;
