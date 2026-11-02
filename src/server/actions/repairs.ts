"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validators/fields";
import { repairRequestSchema } from "@/lib/validators/repairs";
import { createRepairRequest as createRepair } from "@/server/data/repairs";
import { notifyRepair } from "@/server/notifications/repairs";

import type { ActionResult } from "./types";

const FAILURES = {
  NOT_FOUND: "We couldn't find that order in your wardrobe.",
  WINDOW_CLOSED: `Defects must be reported within ${env.REPAIR_WINDOW_DAYS} days of receiving your piece.`,
  ALREADY_OPEN: "You already have an open repair request for this piece.",
} as const;

/**
 * US-D3 AC1–AC2: report a defect on your own fulfilled shop order or completed custom
 * order, within the repair window. The server re-checks ownership and the window.
 */
export async function createRepairRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: "Please sign in to report a defect." };
  const parsed = repairRequestSchema.safeParse({
    ...Object.fromEntries(formData),
    photoUrls: formData.getAll("photoUrls"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await createRepair(
    prisma,
    session.user.id,
    parsed.data,
    new Date(),
    env.REPAIR_WINDOW_DAYS,
  );
  if (!result.ok) return { ok: false, formError: FAILURES[result.code] };

  notifyRepair(result.repairId, { reported: true });
  revalidatePath("/account/wardrobe", "layout");
  revalidatePath("/admin/repairs");
  redirect("/account/wardrobe?repair=reported#repairs");
}
