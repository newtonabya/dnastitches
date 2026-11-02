"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkbox, fieldErrors } from "@/lib/validators/fields";
import { measurementProfileSchema } from "@/lib/validators/measurements";
import * as measurements from "@/server/data/measurements";

import type { ActionResult } from "./types";

const PATH = "/account/measurements";
const SIGNED_OUT: ActionResult = { ok: false, formError: "Please sign in again." };
const NOT_FOUND: ActionResult = { ok: false, formError: "Measurement profile not found." };
const idSchema = z.string().trim().min(1).max(64);

async function currentUserId() {
  return (await auth())?.user?.id ?? null;
}

function parseProfile(formData: FormData) {
  return measurementProfileSchema.safeParse(Object.fromEntries(formData));
}

/** US-B3 AC2: add a profile (optionally as the new default). */
export async function createMeasurementProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const parsed = parseProfile(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  await measurements.createProfile(prisma, userId, parsed.data, {
    makeDefault: checkbox.parse(formData.get("makeDefault") ?? undefined),
  });
  revalidatePath(PATH);
  return { ok: true, message: "Measurements saved." };
}

/** US-B3 AC3: editing saves a new version; the previous one is kept for the atelier. */
export async function updateMeasurementProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const id = idSchema.safeParse(formData.get("profileId"));
  if (!id.success) return NOT_FOUND;
  const parsed = parseProfile(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const result = await measurements.createProfileVersion(prisma, userId, id.data, parsed.data, {
    makeDefault: checkbox.parse(formData.get("makeDefault") ?? undefined),
  });
  if (!result.ok) return NOT_FOUND;
  revalidatePath(PATH);
  return { ok: true, message: "Saved as a new version." };
}

export async function setDefaultMeasurementProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const id = idSchema.safeParse(formData.get("profileId"));
  if (!id.success || !(await measurements.setDefaultProfile(prisma, userId, id.data)))
    return NOT_FOUND;
  revalidatePath(PATH);
  return { ok: true, message: "Default profile updated." };
}
