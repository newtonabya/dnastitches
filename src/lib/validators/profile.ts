import { z } from "zod";

import { nigerianPhone, requiredText } from "./fields";

export const SMS_NEEDS_PHONE = "Add your phone number to get text reminders";

/**
 * US-E1 AC4: name and (optional) Nigerian phone, stored as +234; plus the opt-in for
 * appointment reminders by text (v1.2, US-G2), which needs a phone number.
 */
export const profileSchema = z
  .object({
    name: requiredText("Name", 100),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(nigerianPhone.optional()),
    smsReminders: z
      .union([z.literal("on"), z.literal("true"), z.boolean(), z.null()])
      .optional()
      .transform((v) => v === "on" || v === "true" || v === true),
  })
  .superRefine((v, ctx) => {
    if (v.smsReminders && !v.phone)
      ctx.addIssue({ code: "custom", path: ["smsReminders"], message: SMS_NEEDS_PHONE });
  });

export type ProfileInput = z.input<typeof profileSchema>;
export type Profile = z.output<typeof profileSchema>;
