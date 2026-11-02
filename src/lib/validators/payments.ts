import { z } from "zod";

import { FulfillmentMethod } from "@/generated/prisma/enums";

const id = z.string().trim().min(1).max(64);

const acknowledged = (message: string) =>
  z
    .union([z.literal("on"), z.literal("true"), z.literal(true)], { error: message })
    .transform(() => true as const);

export const FINAL_SALE_MESSAGE = "Please confirm you understand that all sales are final.";
export const DEPOSIT_TERMS_MESSAGE =
  "Please confirm you understand the deposit is non-refundable and all sales are final.";

/** US-A4: checkout for a ready-to-wear piece. The final-sale box must be ticked (AC3). */
export const checkoutSchema = z
  .object({
    productId: id,
    fulfillmentMethod: z.enum(FulfillmentMethod, { error: "Choose pickup or delivery" }),
    addressId: z.preprocess((v) => (v === "" || v === null ? undefined : v), id.optional()),
    finalSaleAcknowledged: acknowledged(FINAL_SALE_MESSAGE),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillmentMethod === "DELIVERY" && !v.addressId) {
      ctx.addIssue({ code: "custom", path: ["addressId"], message: "Choose a delivery address" });
    }
  });

export type CheckoutInput = z.output<typeof checkoutSchema>;

/** US-C4 AC2/AC4: customer pays a deposit or balance online. */
export const customPaymentSchema = z.object({
  orderId: id,
  kind: z.enum(["CUSTOM_DEPOSIT", "CUSTOM_BALANCE"], { error: "Unknown payment type" }),
  termsAcknowledged: acknowledged(DEPOSIT_TERMS_MESSAGE),
});

export type CustomPaymentInput = z.output<typeof customPaymentSchema>;
