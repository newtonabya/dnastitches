import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ReviewList } from "@/components/reviews/review-list";
import { NotifyMeForm } from "@/components/shop/notify-me-form";
import { ProductGallery } from "@/components/shop/product-gallery";
import { SpecTable } from "@/components/shop/spec-table";
import { StatusBadge } from "@/components/shop/status-badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { formatNGN } from "@/lib/money";
import { createNotificationRequest } from "@/server/actions/notification-request";
import type { ProductDetailData } from "@/server/data/products";
import { getProductBySlug } from "@/server/loaders/products";
import { getProductReviews } from "@/server/loaders/reviews";

export async function generateMetadata({ params }: PageProps<"/shop/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Piece not found" };
  const description = excerpt(product.description);
  const image = product.images[0];
  return {
    title: product.name,
    description,
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: image ? [{ url: image.url, alt: image.alt }] : undefined,
    },
  };
}

/** US-A2 (+ US-A3 AC1, US-D2): product detail. */
export default function ProductPage({ params }: PageProps<"/shop/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/shop" className="hover:underline">
          ← Back to shop
        </Link>
      </nav>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductDetail params={params} />
      </Suspense>
    </main>
  );
}

async function ProductDetail({ params }: Pick<PageProps<"/shop/[slug]">, "params">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const soldOut = product.inventoryStatus === "SOLD_OUT";

  return (
    <article className="grid gap-10 lg:grid-cols-2">
      <script
        type="application/ld+json"
        // Product structured data (NFR-7). Content is server-generated JSON, not user HTML.
        dangerouslySetInnerHTML={{ __html: jsonLd(product) }}
      />
      <ProductGallery images={product.images} name={product.name} soldOut={soldOut} />

      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <StatusBadge status={product.inventoryStatus} />
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-xl tabular-nums">{formatNGN(product.priceKobo)}</p>
          <p className="whitespace-pre-line text-muted-foreground">{product.description}</p>
        </header>

        {soldOut ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                This 1-of-1 piece has found its home. We can make one for you.
              </p>
              <Button asChild size="lg">
                <Link href={`/custom/request?fromProduct=${encodeURIComponent(product.id)}`}>
                  Request Custom Version
                </Link>
              </Button>
            </div>
            <div className="rounded-lg border p-4">
              <Suspense fallback={null}>
                <NotifyMeSection productId={product.id} />
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild size="lg">
              <Link href={`/checkout/${encodeURIComponent(product.id)}`}>Buy Now</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              All sales are final. Pickup or delivery within Nigeria.{" "}
              <Link href="/policies/terms" className="underline">
                Terms
              </Link>
            </p>
          </div>
        )}

        <SpecTable measurements={product.measurements} sizeLabel={product.sizeLabel} />

        <section aria-labelledby="fabric-heading" className="flex flex-col gap-3">
          <h2 id="fabric-heading" className="text-lg font-semibold">
            Fabric &amp; care
          </h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="font-medium">Composition</dt>
              <dd className="text-muted-foreground">{product.fabricComposition}</dd>
            </div>
            {product.fabricSwatch ? (
              <div>
                <dt className="font-medium">Fabric</dt>
                <dd className="flex items-center gap-2 text-muted-foreground">
                  <span
                    aria-hidden
                    className="inline-block size-4 rounded-full border"
                    style={{ backgroundColor: product.fabricSwatch.colorHex }}
                  />
                  {product.fabricSwatch.name}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">Care</dt>
              <dd className="whitespace-pre-line text-muted-foreground">
                {product.careInstructions}
              </dd>
            </div>
          </dl>
        </section>

        <Suspense fallback={null}>
          <ProductReviews productId={product.id} />
        </Suspense>
      </div>
    </article>
  );
}

/** US-H1 AC3: approved reviews (cached; refreshed when the owner moderates). */
async function ProductReviews({ productId }: { productId: string }) {
  return <ReviewList reviews={await getProductReviews(productId)} />;
}

/** Reads the session (request-time) to pre-fill the email for signed-in customers (US-D2 AC1). */
async function NotifyMeSection({ productId }: { productId: string }) {
  await connection();
  const session = await auth();
  return (
    <NotifyMeForm
      productId={productId}
      defaultEmail={session?.user?.email}
      action={createNotificationRequest}
    />
  );
}

function ProductSkeleton() {
  return (
    <div role="status" aria-label="Loading piece" className="grid gap-10 lg:grid-cols-2">
      <div className="aspect-[4/5] animate-pulse rounded-lg bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-9 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function jsonLd(product: ProductDetailData): string {
  const availability =
    product.inventoryStatus === "SOLD_OUT"
      ? "https://schema.org/SoldOut"
      : "https://schema.org/InStock";
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: excerpt(product.description, 500),
    image: product.images.map((i) => i.url),
    sku: product.slug,
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency,
      price: (product.priceKobo / 100).toFixed(2),
      availability,
      url: `/shop/${product.slug}`,
    },
  };
  // Escape "<" so the JSON can never close the <script> element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
