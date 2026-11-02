import type { Metadata } from "next";
import { Suspense } from "react";

import { PortfolioForm } from "@/components/admin/catalog-forms";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { savePortfolioItemAction } from "@/server/actions/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { listAdminPortfolio } from "@/server/data/admin/catalog";

export const metadata: Metadata = { title: "Portfolio" };

/** US-C3: manage portfolio items. Unpublish instead of deleting (PRD §5.3). */
export default function PortfolioAdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading portfolio…
          </p>
        }
      >
        <Portfolio />
      </Suspense>
    </main>
  );
}

async function Portfolio() {
  await requireAdmin();
  const [items, products] = await Promise.all([
    listAdminPortfolio(prisma),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const uploadsEnabled = Boolean(env.BLOB_READ_WRITE_TOKEN);
  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border p-4">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="font-medium">{item.title}</span>
                {item.isPublished ? (
                  <Badge variant="secondary">Published</Badge>
                ) : (
                  <Badge variant="outline">Draft</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {item.tags.join(", ") || "no tags"} · {item._count.customOrders} requests
                  {item.sourceProduct ? ` · from ${item.sourceProduct.name}` : ""}
                </span>
              </summary>
              <div className="mt-4">
                <PortfolioForm
                  values={item}
                  products={products}
                  uploadsEnabled={uploadsEnabled}
                  action={savePortfolioItemAction}
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <section aria-label="Add a portfolio item" className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Add a portfolio item</h2>
        <PortfolioForm
          values={{
            title: "",
            description: "",
            imageUrl: "",
            tags: [],
            isPublished: false,
            sourceProductId: null,
          }}
          products={products}
          uploadsEnabled={uploadsEnabled}
          action={savePortfolioItemAction}
        />
      </section>
    </>
  );
}
