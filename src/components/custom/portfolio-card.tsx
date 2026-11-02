import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PortfolioCardData } from "@/server/data/portfolio";

/** Portfolio item with the "I want something like this" call to action (US-B2 AC2). */
export function PortfolioCard({ item }: { item: PortfolioCardData }) {
  return (
    <article data-testid="portfolio-card" className="flex break-inside-avoid flex-col gap-3 pb-8">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
        <Image
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-medium">{item.title}</h2>
        <p className="text-sm text-muted-foreground">{item.description}</p>
        {item.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {item.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button asChild variant="outline">
        <Link href={`/custom/request?fromPortfolio=${encodeURIComponent(item.id)}`}>
          I want something like this<span className="sr-only">: {item.title}</span>
        </Link>
      </Button>
    </article>
  );
}
