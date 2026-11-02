import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ShopPagination } from "@/components/shop/pagination";
import { ProductGrid, ProductGridSkeleton } from "@/components/shop/product-grid";
import { ShopFilterNav } from "@/components/shop/shop-filter-nav";
import { parseShopFilters, shopHref } from "@/lib/shop";
import { getShopProducts } from "@/server/loaders/products";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "1-of-1 ready-to-wear pieces from the DNA Stitches atelier, with real-time availability.",
};

/** US-A1: gallery of published pieces with availability cues, filter and pagination. */
export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
        <p className="text-muted-foreground">
          Every piece is 1-of-1. Sold out? Request a custom version made to your measurements.
        </p>
      </header>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ShopResults searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ShopResults({ searchParams }: Pick<PageProps<"/shop">, "searchParams">) {
  const filters = parseShopFilters(await searchParams);
  const { items, page, pageCount, total } = await getShopProducts(filters);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ShopFilterNav current={filters.status} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total} {total === 1 ? "piece" : "pieces"}
        </p>
      </div>
      {items.length > 0 ? (
        <ProductGrid products={items} />
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No pieces match this filter.</p>
          {filters.status !== "all" ? (
            <Link href={shopHref({})} className="mt-2 inline-block text-sm underline">
              Show all pieces
            </Link>
          ) : null}
        </div>
      )}
      <ShopPagination status={filters.status} page={page} pageCount={pageCount} />
    </div>
  );
}
