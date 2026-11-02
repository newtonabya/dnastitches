"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { moderateReviewSchema } from "@/lib/validators/reviews";
import { getAdminForAction } from "@/server/auth/admin";
import { moderateReview } from "@/server/data/reviews";
import { productTag } from "@/server/loaders/products";
import { REVIEWS_TAG } from "@/server/loaders/reviews";

import type { ActionResult } from "../types";

/** US-H1 AC2–AC3: approve (publish on the product page and home page) or hide. */
export async function moderateReviewAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction()))
    return { ok: false, formError: "You don't have access to do that." };
  const parsed = moderateReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, formError: "Choose approve or hide." };

  const result = await moderateReview(prisma, parsed.data, new Date());
  if (!result.ok) return { ok: false, formError: "That review no longer exists." };
  updateTag(REVIEWS_TAG);
  if (result.productSlug) updateTag(productTag(result.productSlug));
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  revalidatePath("/account/wardrobe", "layout");
  // Redirect with a banner: the review usually leaves the list it was in, which would
  // unmount any message shown next to it.
  const show = formData.get("show");
  const query = new URLSearchParams({ moderated: result.isApproved ? "approved" : "hidden" });
  if (show === "approved" || show === "hidden") query.set("show", show);
  redirect(`/admin/reviews?${query}`);
}
