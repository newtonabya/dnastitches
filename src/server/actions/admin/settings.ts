"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { deliveryZoneSchema, idSchema } from "@/lib/validators/catalog";
import { fieldErrors } from "@/lib/validators/fields";
import { getAdminForAction } from "@/server/auth/admin";
import { createDeliveryZone, updateDeliveryZone } from "@/server/data/admin/settings";

import type { ActionResult } from "../types";

/** D-12: create or edit a delivery zone in /admin/settings. */
export async function saveDeliveryZoneAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction()))
    return { ok: false, formError: "You don't have access to do that." };
  const parsed = deliveryZoneSchema.safeParse({
    name: formData.get("name"),
    states: formData.getAll("states"),
    feeNaira: formData.get("feeNaira"),
    etaDays: formData.get("etaDays"),
    isActive: formData.get("isActive") ?? undefined,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const rawId = formData.get("zoneId");
  if (rawId) {
    const id = idSchema.safeParse(rawId);
    if (!id.success || !(await updateDeliveryZone(prisma, id.data, parsed.data))) {
      return { ok: false, formError: "Zone not found." };
    }
  } else {
    await createDeliveryZone(prisma, parsed.data);
  }
  revalidatePath("/admin/settings");
  return { ok: true, message: rawId ? "Zone saved." : "Zone added." };
}
