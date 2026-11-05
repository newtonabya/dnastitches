import type { ProductCardData } from "@/server/data/products";

import { ProductCard } from "./product-card";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, i) => (
        <li key={product.id}>
          <ProductCard product={product} priority={i < 2} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading products">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} aria-hidden>
            <div className="aspect-[4/5] animate-pulse rounded-lg bg-muted" />
            <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}
