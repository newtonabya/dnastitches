"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp, notifyMeRateLimiter } from "@/lib/rate-limit";
import { fieldErrors } from "@/lib/validators/fields";
import {
  NOTIFY_SUCCESS_MESSAGE,
  notificationRequestSchema,
} from "@/lib/validators/notification-request";
import { saveNotificationRequests } from "@/server/data/notification-requests";

import type { ActionResult } from "./types";

/**
 * US-D2: join the notify-me list for a sold-out piece. Open to visitors (no sign-in
 * required); the session, if any, links the request to the account.
 */
export async function createNotificationRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const ip = getClientIp(await headers());
  const { success } = await notifyMeRateLimiter.limit(`notify:${ip}`);
  if (!success) {
    return { ok: false, formError: "Too many requests. Please try again in a few minutes." };
  }

  const parsed = notificationRequestSchema.safeParse({
    email: formData.get("email"),
    productId: formData.get("productId"),
    types: formData.getAll("types"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await saveNotificationRequests(prisma, {
    ...parsed.data,
    userId: session?.user?.id ?? null,
  });
  if (!result.ok) return { ok: false, formError: "This piece is no longer available." };

  // Same message for first and repeat submissions (idempotent, AC2).
  return { ok: true, message: NOTIFY_SUCCESS_MESSAGE };
}
