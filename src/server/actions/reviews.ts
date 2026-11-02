"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { newReviewOwnerEmail } from "@/emails/reviews";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validators/fields";
import { reviewSchema } from "@/lib/validators/reviews";
import { createReview, getReviewEmailData } from "@/server/data/reviews";

import type { ActionResult } from "./types";

/** US-H1 AC1–AC2: leave one review on my fulfilled order; hidden until approved. */
export async function createReviewAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, formError: "Please sign in to leave a review." };
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await createReview(prisma, session.user.id, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      formError:
        result.code === "ALREADY_REVIEWED"
          ? "You've already reviewed this piece. Thank you!"
          : "Reviews open once your piece has been collected or delivered.",
    };
  }

  after(async () => {
    const review = await getReviewEmailData(prisma, result.reviewId);
    if (!review || env.ADMIN_EMAILS.length === 0) return;
    await sendEmail(
      newReviewOwnerEmail(env.ADMIN_EMAILS, {
        rating: review.rating,
        body: review.body,
        displayName: review.displayName,
        item:
          review.product?.name ??
          (review.customOrder
            ? `${review.customOrder.title} (${review.customOrder.reference})`
            : "a piece"),
        siteUrl: env.NEXT_PUBLIC_SITE_URL,
      }),
    );
  });
  revalidatePath("/account/wardrobe", "layout");
  revalidatePath("/admin/reviews");
  redirect("/account/wardrobe?review=sent");
}
