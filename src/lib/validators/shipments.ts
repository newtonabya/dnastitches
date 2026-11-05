import { z } from "zod";

/** Admin courier forms (v1.2, US-D5). */
export const shipmentTargetSchema = z.object({
  kind: z.enum(["ORDER", "CUSTOM_ORDER"]),
  id: z.string().trim().min(1).max(64),
});

export const bookShipmentSchema = shipmentTargetSchema.extend({
  rateId: z.string().trim().min(1, "Choose a delivery option").max(64),
});

export const refreshShipmentSchema = z.object({
  shipmentId: z.string().trim().min(1).max(64),
});
