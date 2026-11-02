import type { InventoryStatus } from "@/generated/prisma/enums";

/** US-A1: products per page on /shop. */
export const SHOP_PAGE_SIZE = 24;

/** Status filter values used in the `?status=` query string (US-A1 AC6). */
export const SHOP_STATUS_FILTERS = ["all", "available", "sold-out"] as const;
export type ShopStatusFilter = (typeof SHOP_STATUS_FILTERS)[number];

export const SHOP_STATUS_FILTER_LABELS: Record<ShopStatusFilter, string> = {
  all: "All",
  available: "Available",
  "sold-out": "Sold Out",
};

/** Inventory statuses each filter matches. "Available" includes Last One pieces (still buyable). */
export const STATUSES_FOR_FILTER: Record<ShopStatusFilter, readonly InventoryStatus[]> = {
  all: ["AVAILABLE", "LOW_STOCK", "SOLD_OUT"],
  available: ["AVAILABLE", "LOW_STOCK"],
  "sold-out": ["SOLD_OUT"],
};

export interface ShopFilters {
  status: ShopStatusFilter;
  page: number;
}

type SearchParamValue = string | string[] | undefined;

const first = (v: SearchParamValue) => (Array.isArray(v) ? v[0] : v);

/** Parse `/shop` search params, falling back to safe defaults for anything invalid. */
export function parseShopFilters(params: Record<string, SearchParamValue>): ShopFilters {
  const rawStatus = first(params.status)?.toLowerCase();
  const status = (SHOP_STATUS_FILTERS as readonly string[]).includes(rawStatus ?? "")
    ? (rawStatus as ShopStatusFilter)
    : "all";
  const rawPage = Number(first(params.page));
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { status, page };
}

/** Build a `/shop` URL for the given filters, omitting defaults. */
export function shopHref({ status, page }: Partial<ShopFilters>): string {
  const qs = new URLSearchParams();
  if (status && status !== "all") qs.set("status", status);
  if (page && page > 1) qs.set("page", String(page));
  const query = qs.toString();
  return query ? `/shop?${query}` : "/shop";
}

/** Total pages for a result count (at least 1, so an empty shop still has page 1). */
export function pageCount(total: number, pageSize = SHOP_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
