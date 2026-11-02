import Image from "next/image";

import { cn } from "@/lib/utils";
import type { ProductImageData } from "@/server/data/products";

/** Product image gallery (US-A2 AC1). First image is the hero; the rest follow in a grid. */
export function ProductGallery({
  images,
  name,
  soldOut,
}: {
  images: ProductImageData[];
  name: string;
  soldOut: boolean;
}) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-lg bg-muted text-muted-foreground">
        No images of {name} yet
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3" aria-label={`Photos of ${name}`}>
      {images.map((image, i) => (
        <li
          key={image.url}
          className={cn(
            "relative aspect-[4/5] overflow-hidden rounded-lg bg-muted",
            i === 0 && "col-span-2",
          )}
        >
          <Image
            src={image.url}
            alt={image.alt}
            fill
            priority={i === 0}
            sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
            className={cn("object-cover", soldOut && "grayscale")}
          />
        </li>
      ))}
    </ul>
  );
}
