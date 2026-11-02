import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PortfolioCard } from "@/components/custom/portfolio-card";
import { cn } from "@/lib/utils";
import { getPortfolio, getPortfolioTags } from "@/server/loaders/portfolio";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Past commissions from the DNA Stitches atelier. Find a piece you love and start your own.",
};

/** US-B2: portfolio gallery with tag filters. */
export default function GalleryPage({ searchParams }: PageProps<"/custom/gallery">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-muted-foreground">
          Past commissions. See something you love? Tap &ldquo;I want something like this&rdquo; to
          start your own request.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading the portfolio…
          </p>
        }
      >
        <Gallery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Gallery({ searchParams }: Pick<PageProps<"/custom/gallery">, "searchParams">) {
  const params = await searchParams;
  const raw = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const tags = await getPortfolioTags();
  const tag = raw && tags.includes(raw) ? raw : undefined;
  const items = await getPortfolio(tag);

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Filter by tag">
        <ul className="flex flex-wrap gap-2">
          {[undefined, ...tags].map((t) => {
            const active = t === tag;
            return (
              <li key={t ?? "all"}>
                <Link
                  href={t ? `/custom/gallery?tag=${encodeURIComponent(t)}` : "/custom/gallery"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-4 text-sm capitalize",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {t ?? "All"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {items.length > 0 ? (
        <ul className="columns-1 gap-6 sm:columns-2 lg:columns-3">
          {items.map((item) => (
            <li key={item.id}>
              <PortfolioCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-10 text-center">No portfolio pieces yet.</p>
      )}
    </div>
  );
}
