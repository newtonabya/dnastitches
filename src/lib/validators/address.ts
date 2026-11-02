import { z } from "zod";

import { checkbox, nigerianPhone, nigerianState, optionalText, requiredText } from "./fields";

/** Nigerian delivery address (PRD §5.2 Address). */
export const addressSchema = z.object({
  recipientName: requiredText("Recipient name", 100),
  phone: nigerianPhone,
  line1: requiredText("Address line 1", 200),
  line2: optionalText("Address line 2"),
  city: requiredText("City / town", 100),
  state: nigerianState,
  landmark: optionalText("Landmark"),
  isDefault: checkbox,
});

export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;

export const addressIdSchema = z.object({ addressId: z.string().min(1).max(64) });
