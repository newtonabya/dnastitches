import { z } from "zod";

import { NotificationRequestType } from "@/generated/prisma/enums";

import { emailAddress } from "./fields";

/** US-D2: notify-me request for a sold-out product. One row per selected type. */
export const notificationRequestSchema = z.object({
  email: emailAddress,
  productId: z.string().trim().min(1, "Product is required").max(64),
  types: z
    .array(z.enum(NotificationRequestType))
    .min(1, "Choose at least one option")
    .transform((types) => [...new Set(types)]),
});

export type NotificationRequestInput = z.input<typeof notificationRequestSchema>;
export type NotificationRequest = z.output<typeof notificationRequestSchema>;

/** Shown for first and repeat submissions alike (idempotent, US-D2 AC2). */
export const NOTIFY_SUCCESS_MESSAGE =
  "You're on the list. We'll email you if this style or a similar fabric becomes available.";
