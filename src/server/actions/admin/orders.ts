"use server";

import { revalidatePath } from "next/cache";

import type { CustomOrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  adminNotesSchema,
  offlinePaymentSchema,
  quoteSchema,
  transitionSchema,
} from "@/lib/validators/admin";
import { fieldErrors } from "@/lib/validators/fields";
import { getAdminForAction } from "@/server/auth/admin";
import * as orders from "@/server/data/admin/orders";
import { notifyCustomerOfStatus } from "@/server/notifications/order-status";

import type { ActionResult } from "../types";

const NOT_ALLOWED: ActionResult = { ok: false, formError: "You don't have access to do that." };

function revalidateOrder(orderId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

/**
 * US-C1: move a custom order. Used by both the Kanban board (drag and drop) and the
 * status <select> on the detail page. Returns a typed error (e.g. "Deposit not yet
 * paid.") so the board can snap the card back.
 */
export async function updateCustomOrderStatus(
  _prev: ActionResult<{ code?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ code?: string; status?: CustomOrderStatus }>> {
  const admin = await getAdminForAction();
  if (!admin) return NOT_ALLOWED;
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await orders.transitionCustomOrder(prisma, {
    orderId: parsed.data.orderId,
    to: parsed.data.to,
    actorId: admin.id,
    note: parsed.data.note,
    confirmForfeit: parsed.data.confirmForfeit,
    expectedFrom: parsed.data.expectedFrom,
  });
  if (!result.ok)
    return { ok: false, formError: result.message, fieldErrors: { code: result.code } };

  notifyCustomerOfStatus(parsed.data.orderId);
  revalidateOrder(parsed.data.orderId);
  return {
    ok: true,
    message: `Moved to ${result.to.replace(/_/g, " ").toLowerCase()}.`,
    data: { status: result.to },
  };
}

/** US-C4 AC1: save and send a quote. */
export async function sendQuoteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await getAdminForAction();
  if (!admin) return NOT_ALLOWED;
  const parsed = quoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await orders.sendQuote(prisma, { ...parsed.data, actorId: admin.id });
  if (!result.ok) return { ok: false, formError: result.message };

  notifyCustomerOfStatus(parsed.data.orderId);
  revalidateOrder(parsed.data.orderId);
  return {
    ok: true,
    message: result.movedToAwaitingDeposit
      ? "Quote sent. The order is now awaiting the deposit."
      : "Quote updated and re-sent.",
  };
}

/** US-C4 AC5: record a cash or direct-transfer payment. */
export async function recordOfflinePaymentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await getAdminForAction();
  if (!admin) return NOT_ALLOWED;
  const parsed = offlinePaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const result = await orders.recordOfflinePayment(prisma, { ...parsed.data, actorId: admin.id });
  if (!result.ok) return { ok: false, formError: result.message };

  if (result.advancedTo) notifyCustomerOfStatus(parsed.data.orderId);
  revalidateOrder(parsed.data.orderId);
  return {
    ok: true,
    message: result.advancedTo
      ? "Payment recorded. Deposit received, so the order moved to In production."
      : "Payment recorded.",
  };
}

/** Private admin notes (never shown to the customer). */
export async function updateAdminNotesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await getAdminForAction();
  if (!admin) return NOT_ALLOWED;
  const parsed = adminNotesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (!(await orders.updateAdminNotes(prisma, parsed.data.orderId, parsed.data.adminNotes))) {
    return { ok: false, formError: "Order not found." };
  }
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { ok: true, message: "Notes saved." };
}
