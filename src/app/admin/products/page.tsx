import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { StatusBadge } from "@/components/shop/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth/guards";
import { listAdminProducts } from "@/server/data/admin/catalog";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <Button asChild>
          <Link href="/admin/products/new">New product</Link>
        </Button>
      </div>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading products…
          </p>
        }
      >
        <Products />
      </Suspense>
    </main>
  );
}

async function Products() {
  await requireAdmin();
  const products = await listAdminProducts(prisma);
  if (products.length === 0)
    return <p className="text-sm text-muted-foreground">No products yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Products</caption>
        <thead className="bg-muted/40 text-left">
          <tr>
            <th scope="col" className="p-3 font-medium">
              Product
            </th>
            <th scope="col" className="p-3 font-medium">
              Price
            </th>
            <th scope="col" className="p-3 font-medium">
              Stock
            </th>
            <th scope="col" className="p-3 font-medium">
              Visibility
            </th>
            <th scope="col" className="p-3 text-right font-medium">
              Notify-me
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {products.map((p) => (
            <tr key={p.id}>
              <td className="p-3">
                <div className="flex items-center gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded bg-muted">
                    {p.image ? (
                      <Image src={p.image.url} alt="" fill sizes="48px" className="object-cover" />
                    ) : null}
                  </div>
                  <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </div>
              </td>
              <td className="p-3 tabular-nums">{formatNGN(p.priceKobo)}</td>
              <td className="p-3">
                <span className="flex items-center gap-2">
                  <StatusBadge status={p.inventoryStatus} />
                  <span className="text-muted-foreground tabular-nums">{p.quantity}</span>
                </span>
              </td>
              <td className="p-3">
                {p.isPublished ? (
                  <Badge variant="secondary">Published</Badge>
                ) : (
                  <Badge variant="outline">Draft</Badge>
                )}
              </td>
              <td className="p-3 text-right tabular-nums">{p.notifyCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
