import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EMPTY_PRODUCT, ProductForm } from "@/components/admin/catalog-forms";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createProductAction } from "@/server/actions/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/products" className="hover:underline">
          ← Products
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">New product</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        }
      >
        <NewProduct />
      </Suspense>
    </main>
  );
}

async function NewProduct() {
  await requireAdmin();
  const swatches = await prisma.fabricSwatch.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <ProductForm
      values={EMPTY_PRODUCT}
      swatches={swatches}
      uploadsEnabled={Boolean(env.BLOB_READ_WRITE_TOKEN)}
      action={createProductAction}
    />
  );
}
