"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { REPAIR_STATUS_LABELS } from "@/lib/repairs";
import { fieldErrors } from "@/lib/validators/fields";
import { repairUpdateSchema } from "@/lib/validators/repairs";
import { getAdminForAction } from "@/server/auth/admin";
import { updateRepairRequest as updateRepair } from "@/server/data/repairs";
import { notifyRepair } from "@/server/notifications/repairs";

import type { ActionResult } from "../types";

/** US-D3 AC3: admin moves a repair along (emailing the customer) or saves private notes. */
export async function updateRepairRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction()))
    return { ok: false, formError: "You don't have access to do that." };
  const parsed = repairUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await updateRepair(prisma, parsed.data, new Date());
  if (!result.ok) {
    return {
      ok: false,
      formError:
        result.code === "NOT_FOUND"
          ? "That repair request no longer exists."
          : `A repair that is ${REPAIR_STATUS_LABELS[result.from ?? "OPEN"].toLowerCase()} can't move to ${REPAIR_STATUS_LABELS[parsed.data.to].toLowerCase()}.`,
    };
  }
  if (result.changed) notifyRepair(parsed.data.repairId, { reported: false });
  revalidatePath("/admin/repairs");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/account/wardrobe", "layout");
  return {
    ok: true,
    message: result.changed
      ? `Moved to ${REPAIR_STATUS_LABELS[result.status]}. The customer has been emailed.`
      : "Notes saved.",
  };
}
