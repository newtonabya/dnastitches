"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { checkbox, fieldErrors } from "@/lib/validators/fields";
import { measurementProfileSchema } from "@/lib/validators/measurements";
import { getAdminForAction } from "@/server/auth/admin";
import { createProfile } from "@/server/data/measurements";

import type { ActionResult } from "../types";

/** US-C2 AC3: record measurements on a client's behalf (takenBy = ADMIN). */
export async function recordClientMeasurementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await getAdminForAction();
  if (!admin) return { ok: false, formError: "You don't have access to do that." };
  const userId = z.string().trim().min(1).max(64).safeParse(formData.get("userId"));
  if (!userId.success) return { ok: false, formError: "Client not found." };
  const client = await prisma.user.findUnique({ where: { id: userId.data }, select: { id: true } });
  if (!client) return { ok: false, formError: "Client not found." };

  const parsed = measurementProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  await createProfile(prisma, client.id, parsed.data, {
    takenBy: "ADMIN",
    makeDefault: checkbox.parse(formData.get("makeDefault") ?? undefined),
  });
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: true, message: "Measurements recorded." };
}
