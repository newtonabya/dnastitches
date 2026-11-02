import { z } from "zod";

import { nigerianPhone, requiredText } from "./fields";

/** US-E1 AC4: name and (optional) Nigerian phone, stored as +234. */
export const profileSchema = z.object({
  name: requiredText("Name", 100),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(nigerianPhone.optional()),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type Profile = z.output<typeof profileSchema>;
