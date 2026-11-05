"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validators/fields";
import { bookShipmentSchema, refreshShipmentSchema } from "@/lib/validators/shipments";
import { getAdminForAction } from "@/server/auth/admin";
import { getCourierProvider, shipmentSettings } from "@/server/courier";
import { type ShipmentTarget, bookShipment, refreshShipment } from "@/server/data/shipments";
import { sendShippingEmail } from "@/server/notifications/shipping";

import type { ActionResult } from "../types";

const NO_ACCESS = { ok: false, formError: "You don't have access to do that." } as const;
const NO_COURIER = {
  ok: false,
  formError: "Courier booking is off. Set SENDBOX_API_KEY to turn it on.",
} as const;

function revalidateTarget(target: ShipmentTarget) {
  revalidatePath(
    target.kind === "ORDER" ? `/admin/orders/shop/${target.id}` : `/admin/orders/${target.id}`,
  );
  revalidatePath("/admin/orders");
}

/** US-D5: book the courier for a paid shop order or a ready, fully paid custom order. */
export async function bookShipmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await getAdminForAction();
  if (!admin) return NO_ACCESS;
  const parsed = bookShipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const provider = getCourierProvider();
  if (!provider) return NO_COURIER;

  const target: ShipmentTarget = { kind: parsed.data.kind, id: parsed.data.id };
  const result = await bookShipment(prisma, provider, target, {
    rateId: parsed.data.rateId,
    adminId: admin.id,
    now: new Date(),
    ...shipmentSettings(),
  });
  if (!result.ok) return { ok: false, formError: result.message };

  sendShippingEmail(result.shipmentId, "BOOKED");
  revalidateTarget(target);
  return {
    ok: true,
    message:
      result.providerStatus === "drafted"
        ? `Booked (tracking ${result.trackingCode}), but on hold: top up your Sendbox wallet so the courier is dispatched.`
        : `Courier booked. Tracking ${result.trackingCode}. The customer has been emailed.`,
  };
}

/** Ask the courier for the latest now, instead of waiting for the next automatic check. */
export async function refreshShipmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NO_ACCESS;
  const parsed = refreshShipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, formError: "Shipment not found." };
  const provider = getCourierProvider();
  if (!provider) return NO_COURIER;

  try {
    const applied = await refreshShipment(prisma, provider, parsed.data.shipmentId, new Date());
    if (!applied) return { ok: false, formError: "Shipment not found." };
    if (applied.becameDelivered) sendShippingEmail(applied.shipmentId, "DELIVERED");
    revalidateTarget(
      applied.orderId
        ? { kind: "ORDER", id: applied.orderId }
        : { kind: "CUSTOM_ORDER", id: applied.customOrderId! },
    );
    return { ok: true, message: applied.changed ? "Tracking updated." : "No change yet." };
  } catch (error) {
    return {
      ok: false,
      formError: `Couldn't get tracking: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
