import { z } from "zod";

import { CustomOrderStatus } from "@/generated/prisma/enums";
import { nairaToKobo } from "@/lib/money";

import { checkbox, optionalText } from "./fields";

const id = z.string().trim().min(1).max(64);

const naira = (label: string, { allowZero = false, emptyAsZero = false } = {}) =>
  z.preprocess(
    (v) => {
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        return emptyAsZero ? 0 : undefined;
      }
      return typeof v === "string" ? Number(v.replace(/,/g, "")) : v;
    },
    z
      .number({
        error: (i) =>
          i.input === undefined ? `${label} is required` : `${label} must be a number`,
      })
      .finite(`${label} must be a number`)
      .refine(
        (n) => (allowZero ? n >= 0 : n > 0),
        allowZero ? `${label} can't be negative` : `${label} must be more than ₦0`,
      )
      .refine((n) => n <= 100_000_000, `${label} looks too high`)
      .transform(nairaToKobo),
  );

/** US-C1: move a custom order to a new status. */
export const transitionSchema = z.object({
  orderId: id,
  to: z.enum(CustomOrderStatus, { error: "Choose a status" }),
  /** The status the admin's screen showed; a mismatch means someone else moved it first. */
  expectedFrom: z
    .enum(CustomOrderStatus)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: optionalText("Note", 500),
  /** Required to cancel after a deposit was paid (US-C1 AC7). */
  confirmForfeit: checkbox,
});

/** US-C4 AC1: quote with deposit and delivery fee, all entered in naira. */
export const quoteSchema = z
  .object({
    orderId: id,
    quotedPriceNaira: naira("Quoted price"),
    depositNaira: naira("Deposit"),
    deliveryFeeNaira: naira("Delivery fee", { allowZero: true, emptyAsZero: true }),
  })
  .superRefine((q, ctx) => {
    if (q.depositNaira > q.quotedPriceNaira + q.deliveryFeeNaira) {
      ctx.addIssue({
        code: "custom",
        path: ["depositNaira"],
        message: "Deposit can't be more than the total",
      });
    }
  })
  .transform((q) => ({
    orderId: q.orderId,
    quotedPriceKobo: q.quotedPriceNaira,
    depositKobo: q.depositNaira,
    deliveryFeeKobo: q.deliveryFeeNaira,
  }));

/** US-C4 AC5: cash or direct transfer recorded by the admin. */
export const offlinePaymentSchema = z
  .object({
    orderId: id,
    kind: z.enum(["CUSTOM_DEPOSIT", "CUSTOM_BALANCE"], { error: "Choose deposit or balance" }),
    amountNaira: naira("Amount"),
    note: optionalText("Note", 500),
  })
  .transform(({ amountNaira, ...rest }) => ({ ...rest, amountKobo: amountNaira }));

export const adminNotesSchema = z.object({
  orderId: id,
  adminNotes: z.string().max(5000, "Notes must be at most 5000 characters").optional().default(""),
});
