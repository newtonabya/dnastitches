"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validators/catalog";
import { getAdminForAction } from "@/server/auth/admin";
import { markOrderFulfilled } from "@/server/data/checkout";

import type { ActionResult } from "../types";

/** US-A4 AC8: mark a paid ready-to-wear order as picked up / delivered. */
export async function markOrderFulfilledAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction()))
    return { ok: false, formError: "You don't have access to do that." };
  const id = idSchema.safeParse(formData.get("orderId"));
  if (!id.success || !(await markOrderFulfilled(prisma, id.data))) {
    return { ok: false, formError: "Only paid orders can be marked as fulfilled." };
  }
  revalidatePath("/admin/orders");
  return { ok: true, message: "Marked as fulfilled." };
}
