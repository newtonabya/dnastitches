import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
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
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-10">
      <FittingBanner />
      <header className="mb-6 flex flex-col gap-2 sm:mb-8">
        <h1 className="text-4xl font-medium tracking-wide">Shop</h1>
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

/** The prominent way into bespoke: book a consultation and fitting (US-F1). */
function FittingBanner() {
  return (
    <Link
      href="/custom/book"
      className="group relative mb-8 flex items-center justify-between gap-4 overflow-hidden rounded-md border border-primary/50 bg-[radial-gradient(ellipse_at_10%_0%,oklch(0.8_0.115_85/0.22),transparent_55%),linear-gradient(135deg,oklch(0.2_0.01_80),oklch(0.14_0.004_80))] px-5 py-6 transition-colors hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:px-8 sm:py-8"
    >
      <span className="flex flex-col gap-1">
        <span className="text-[11px] tracking-[0.25em] text-gold-soft uppercase">
          Made to your measurements
        </span>
        <span className="font-serif text-2xl font-medium text-foreground sm:text-3xl">
          Book a Bespoke Fitting
        </span>
        <span className="text-sm text-muted-foreground">
          In the studio or by video call, at a time that suits you.
        </span>
      </span>
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/60 text-primary transition-transform group-hover:translate-x-1"
      >
        <ArrowRight className="size-5" />
      </span>
    </Link>
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
