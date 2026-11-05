"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncUserReminders } from "@/server/data/reminders";
import { addressIdSchema, addressSchema } from "@/lib/validators/address";
import { fieldErrors } from "@/lib/validators/fields";
import { profileSchema } from "@/lib/validators/profile";
import * as account from "@/server/data/account";

import type { ActionResult } from "./types";

const PROFILE_PATH = "/account/profile";
const SIGNED_OUT: ActionResult = { ok: false, formError: "Please sign in again." };

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** US-E1 AC4: update name and phone (stored as +234). */
export async function updateProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? undefined,
    smsReminders: formData.get("smsReminders"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  await account.updateProfile(prisma, userId, parsed.data);
  // Text opt-in or phone changed: add or remove text reminders for upcoming appointments.
  await syncUserReminders(prisma, userId, new Date());
  revalidatePath(PROFILE_PATH);
  return { ok: true, message: "Profile saved." };
}

export async function createAddressAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  await account.createAddress(prisma, userId, parsed.data);
  revalidatePath(PROFILE_PATH);
  return { ok: true, message: "Address added." };
}

export async function setDefaultAddressAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const parsed = addressIdSchema.safeParse({ addressId: formData.get("addressId") });
  if (!parsed.success) return { ok: false, formError: "Address not found." };
  const updated = await account.setDefaultAddress(prisma, userId, parsed.data.addressId);
  if (!updated) return { ok: false, formError: "Address not found." };
  revalidatePath(PROFILE_PATH);
  return { ok: true, message: "Default address updated." };
}

export async function deleteAddressAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const parsed = addressIdSchema.safeParse({ addressId: formData.get("addressId") });
  if (!parsed.success) return { ok: false, formError: "Address not found." };
  const result = await account.deleteAddress(prisma, userId, parsed.data.addressId);
  if (!result.ok) {
    return {
      ok: false,
      formError:
        result.reason === "IN_USE"
          ? "This address is linked to an order, so it can't be deleted."
          : "Address not found.",
    };
  }
  revalidatePath(PROFILE_PATH);
  return { ok: true, message: "Address deleted." };
}
