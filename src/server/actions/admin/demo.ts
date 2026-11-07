"use server";

import { revalidatePath, updateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAdminForAction } from "@/server/auth/admin";
import { loadDemoContent, removeDemoContent } from "@/server/data/admin/demo";
import { PORTFOLIO_TAG, SWATCHES_TAG } from "@/server/loaders/portfolio";
import { PRODUCTS_TAG } from "@/server/loaders/products";

import type { ActionResult } from "../types";

const NOT_ALLOWED: ActionResult = { ok: false, formError: "You don't have access to do that." };

function refreshEverything() {
  updateTag(PRODUCTS_TAG);
  updateTag(SWATCHES_TAG);
  updateTag(PORTFOLIO_TAG);
  for (const path of ["/admin/settings", "/admin/products", "/admin/swatches", "/admin/portfolio"])
    revalidatePath(path);
}

/**
 * Admin → Settings: add the sample catalogue (intent "load") or take it away again
 * (intent "remove"). See src/server/data/admin/demo.ts.
 */
export async function demoContentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await getAdminForAction();
  if (!admin) return NOT_ALLOWED;
  const intent = formData.get("intent");

  if (intent === "load") {
    const { addedHours } = await loadDemoContent(prisma);
    console.info(`[demo] Demo content loaded by admin ${admin.id}`);
    refreshEverything();
    return {
      ok: true,
      message: addedHours
        ? "Demo content added, with weekday and Saturday booking hours."
        : "Demo content added. Your booking hours were left as they are.",
    };
  }

  if (intent === "remove") {
    const { kept } = await removeDemoContent(prisma);
    console.info(`[demo] Demo content removed by admin ${admin.id}`);
    refreshEverything();
    return {
      ok: true,
      message:
        kept > 0
          ? `Demo content removed. ${kept} demo product(s) with orders were hidden instead of deleted.`
          : "Demo content removed.",
    };
  }

  return { ok: false, formError: "Unknown request." };
}
