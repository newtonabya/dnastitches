import { z } from "zod";

import { NIGERIAN_STATES, normalizeNigerianPhone } from "@/lib/nigeria";

/** A trimmed, required single-line string. */
export const requiredText = (label: string, max = 120) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

/** A trimmed optional string; empty input becomes `undefined`. */
export const optionalText = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Nigerian mobile number, normalised to E.164 (+234…). */
export const nigerianPhone = z
  .string({ error: "Phone number is required" })
  .trim()
  .min(1, "Phone number is required")
  .transform((value, ctx) => {
    const normalised = normalizeNigerianPhone(value);
    if (!normalised) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid Nigerian mobile number, e.g. 0803 123 4567",
      });
      return z.NEVER;
    }
    return normalised;
  });

export const nigerianState = z.enum(NIGERIAN_STATES, { error: "Choose a state" });

/** Lower-cased, trimmed email. */
export const emailAddress = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

/** HTML checkbox: "on"/"true" → true, missing → false. */
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

/** Flatten a ZodError into `{ field: firstMessage }` for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
