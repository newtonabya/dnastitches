import Image from "next/image";
import Link from "next/link";

import { formatNGN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/server/data/products";

import { StatusBadge } from "./status-badge";

/** Shop grid card (US-A1 AC1–4). Sold-out pieces render greyscale with a translucent overlay. */
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardData;
  priority?: boolean;
}) {
  const soldOut = product.inventoryStatus === "SOLD_OUT";
  return (
    <article data-testid="product-card" data-status={product.inventoryStatus} className="group">
      <Link
        href={`/shop/${product.slug}`}
        className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className={cn(
                "object-cover transition-transform duration-300 group-hover:scale-[1.02]",
                soldOut && "grayscale",
              )}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image
            </div>
          )}
          {soldOut ? (
            <div
              data-testid="sold-out-overlay"
              aria-hidden
              className="absolute inset-0 bg-background/40"
            />
          ) : null}
          <StatusBadge status={product.inventoryStatus} className="absolute top-3 left-3" />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <h2 className="font-medium group-hover:underline">{product.name}</h2>
          <p className={cn("shrink-0 tabular-nums", soldOut && "text-muted-foreground")}>
            {formatNGN(product.priceKobo)}
          </p>
        </div>
      </Link>
    </article>
  );
}
