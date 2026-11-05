"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { idSchema, portfolioSchema, productSchema, swatchSchema } from "@/lib/validators/catalog";
import { fieldErrors } from "@/lib/validators/fields";
import { getAdminForAction } from "@/server/auth/admin";
import * as catalog from "@/server/data/admin/catalog";
import { PORTFOLIO_TAG, SWATCHES_TAG } from "@/server/loaders/portfolio";
import { claimRestockRequests } from "@/server/data/restock";
import { PRODUCTS_TAG, productTag } from "@/server/loaders/products";
import { sendRestockEmails } from "@/server/notifications/restock";

import type { ActionResult } from "../types";

/**
 * US-C3 catalog mutations. Each action re-checks the admin role, validates with the
 * shared Zod schema, and refreshes the affected public pages (updateTag for the
 * `use cache` loaders, revalidatePath for admin lists).
 */

const NOT_ALLOWED: ActionResult = { ok: false, formError: "You don't have access to do that." };
const NOT_FOUND: ActionResult = { ok: false, formError: "Not found. It may have been removed." };

function refreshProducts(...slugs: string[]) {
  updateTag(PRODUCTS_TAG);
  for (const slug of new Set(slugs)) updateTag(productTag(slug));
  revalidatePath("/admin/products");
}

// ── Products ────────────────────────────────────────────────────────────────

export async function createProductAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NOT_ALLOWED;
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const result = await catalog.createProduct(prisma, parsed.data);
  if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };
  refreshProducts(result.slug);
  redirect(`/admin/products/${result.id}?created=1`);
}

export async function updateProductAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NOT_ALLOWED;
  const id = idSchema.safeParse(formData.get("productId"));
  if (!id.success) return NOT_FOUND;
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const result = await catalog.updateProduct(prisma, id.data, parsed.data);
  if (!result.ok)
    return "notFound" in result ? NOT_FOUND : { ok: false, fieldErrors: result.fieldErrors };
  refreshProducts(result.oldSlug, result.slug);
  // v1.2 (US-D4): if it's published and in stock, email everyone waiting for a restock.
  const claimed = await claimRestockRequests(prisma, id.data, new Date());
  sendRestockEmails(id.data, claimed);
  revalidatePath(`/admin/products/${id.data}`);
  const saved =
    result.slug !== result.oldSlug
      ? `Saved. The page address is now /shop/${result.slug}.`
      : "Saved.";
  return {
    ok: true,
    message:
      claimed.length > 0
        ? `${saved} Emailing ${claimed.length} ${claimed.length === 1 ? "person" : "people"} who asked to hear when it's back.`
        : saved,
  };
}

export async function markProductSoldOutAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NOT_ALLOWED;
  const id = idSchema.safeParse(formData.get("productId"));
  if (!id.success) return NOT_FOUND;
  const result = await catalog.markProductSoldOut(prisma, id.data);
  if (!result) return NOT_FOUND;
  refreshProducts(result.slug);
  revalidatePath(`/admin/products/${id.data}`);
  return { ok: true, message: "Marked as sold out." };
}

/** US-D2 AC4: notify-me requests for a product as CSV (downloaded by the browser). */
export async function exportNotifyRequestsCsvAction(
  productId: string,
): Promise<ActionResult<{ filename: string; csv: string }>> {
  if (!(await getAdminForAction())) return NOT_ALLOWED;
  const id = idSchema.safeParse(productId);
  if (!id.success) return NOT_FOUND;
  const product = await prisma.product.findUnique({
    where: { id: id.data },
    select: { slug: true },
  });
  if (!product) return NOT_FOUND;
  const rows = await catalog.listProductNotificationRequests(prisma, id.data);
  const csv = toCsv(
    ["email", "name", "type", "requested_at", "notified_at"],
    rows.map((r) => [r.email, r.user?.name ?? "", r.type, r.createdAt, r.notifiedAt]),
  );
  return { ok: true, data: { filename: `notify-requests-${product.slug}.csv`, csv } };
}

// ── Swatches ────────────────────────────────────────────────────────────────

function refreshSwatches() {
  updateTag(SWATCHES_TAG);
  // Product pages show the swatch name and colour.
  updateTag(PRODUCTS_TAG);
  revalidatePath("/admin/swatches");
}

export async function saveSwatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NOT_ALLOWED;
  const parsed = swatchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const rawId = formData.get("swatchId");
  if (rawId) {
    const id = idSchema.safeParse(rawId);
    if (!id.success) return NOT_FOUND;
    const result = await catalog.updateSwatch(prisma, id.data, parsed.data);
    if (!result.ok)
      return "notFound" in result ? NOT_FOUND : { ok: false, fieldErrors: result.fieldErrors };
  } else {
    const result = await catalog.createSwatch(prisma, parsed.data);
    if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };
  }
  refreshSwatches();
  return { ok: true, message: rawId ? "Swatch saved." : "Swatch added." };
}

// ── Portfolio ───────────────────────────────────────────────────────────────

export async function savePortfolioItemAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getAdminForAction())) return NOT_ALLOWED;
  const parsed = portfolioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const rawId = formData.get("portfolioItemId");
  if (rawId) {
    const id = idSchema.safeParse(rawId);
    if (!id.success) return NOT_FOUND;
    const result = await catalog.updatePortfolioItem(prisma, id.data, parsed.data);
    if (!result.ok)
      return "notFound" in result ? NOT_FOUND : { ok: false, fieldErrors: result.fieldErrors };
  } else {
    const result = await catalog.createPortfolioItem(prisma, parsed.data);
    if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };
  }
  updateTag(PORTFOLIO_TAG);
  revalidatePath("/admin/portfolio");
  return { ok: true, message: rawId ? "Portfolio item saved." : "Portfolio item added." };
}
