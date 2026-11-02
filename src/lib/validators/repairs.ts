import { z } from "zod";

import { RepairStatus } from "@/generated/prisma/enums";
import { MAX_REPAIR_PHOTOS, isBlobUrl } from "@/lib/uploads";

const id = z.string().trim().min(1).max(64);
const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, `${label} must be ${max} characters or fewer`).optional(),
  );

/** FormData sends repeated `photoUrls` fields; accept a single string or an array. */
const photoUrls = z.preprocess(
  (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]),
  z
    .array(z.string().refine(isBlobUrl, "Photos must be uploaded through the form"))
    .max(MAX_REPAIR_PHOTOS, `You can add up to ${MAX_REPAIR_PHOTOS} photos`),
);

/** US-D3 AC2: a customer reports a defect on a fulfilled shop order or completed custom order. */
export const repairRequestSchema = z.object({
  kind: z.enum(["ORDER", "CUSTOM_ORDER"], { error: "Unknown order type" }),
  targetId: id,
  description: z
    .string({ error: "Describe the problem" })
    .trim()
    .min(10, "Please describe the problem in a little more detail (at least 10 characters)")
    .max(2000, "Description must be 2,000 characters or fewer"),
  photoUrls,
});

export type RepairRequestInput = z.output<typeof repairRequestSchema>;

export const REJECTION_REASON_REQUIRED = "Give the customer a reason for the rejection";

/** US-D3 AC3: admin moves a repair along, with a reason when rejecting. */
export const repairUpdateSchema = z
  .object({
    repairId: id,
    to: z.enum(RepairStatus, { error: "Choose a status" }),
    rejectionReason: optionalText(1000, "Reason"),
    adminNotes: optionalText(5000, "Notes"),
  })
  .superRefine((v, ctx) => {
    if (v.to === "REJECTED" && !v.rejectionReason) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectionReason"],
        message: REJECTION_REASON_REQUIRED,
      });
    }
  });

export type RepairUpdateInput = z.output<typeof repairUpdateSchema>;
