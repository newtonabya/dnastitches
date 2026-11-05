import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MarkSoldOutButton, NotifyCsvButton, ProductForm } from "@/components/admin/catalog-forms";
import { StatusBadge } from "@/components/shop/status-badge";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  exportNotifyRequestsCsvAction,
  markProductSoldOutAction,
  updateProductAction,
} from "@/server/actions/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { getAdminProduct, listProductNotificationRequests } from "@/server/data/admin/catalog";

export const metadata: Metadata = { title: "Edit product" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

export default function EditProductPage({
  params,
  searchParams,
}: PageProps<"/admin/products/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/admin/products" className="hover:underline">
          ← Products
        </Link>
      </nav>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading product…
          </p>
        }
      >
        <EditProduct params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function EditProduct({
  params,
  searchParams,
}: Pick<PageProps<"/admin/products/[id]">, "params" | "searchParams">) {
  await requireAdmin();
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const [product, swatches, requests] = await Promise.all([
    getAdminProduct(prisma, id),
    prisma.fabricSwatch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listProductNotificationRequests(prisma, id),
  ]);
  if (!product) notFound();

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <StatusBadge status={product.inventoryStatus} />
          {product.isPublished ? (
            <Link href={`/shop/${product.slug}`} className="text-sm underline">
              View in shop
            </Link>
          ) : null}
        </header>
        {created ? (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            Product created{product.isPublished ? " and published" : " as a draft"}.
          </p>
        ) : null}
        <ProductForm
          values={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            description: product.description,
            priceKobo: product.priceKobo,
            quantity: product.quantity,
            sizeLabel: product.sizeLabel,
            bustCm: product.bustCm,
            waistCm: product.waistCm,
            hipsCm: product.hipsCm,
            lengthCm: product.lengthCm,
            fabricComposition: product.fabricComposition,
            careInstructions: product.careInstructions,
            fabricSwatchId: product.fabricSwatchId,
            isPublished: product.isPublished,
            images: product.images,
          }}
          swatches={swatches}
          uploadsEnabled={Boolean(env.BLOB_READ_WRITE_TOKEN)}
          action={updateProductAction}
        />
      </div>

      <aside className="flex flex-col gap-8">
        {product.inventoryStatus !== "SOLD_OUT" ? (
          <section aria-label="Sold in person" className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Sold in person?</h2>
            <p className="text-sm text-muted-foreground">
              Sets the quantity to 0 and shows the piece as sold out.
            </p>
            <MarkSoldOutButton productId={product.id} action={markProductSoldOutAction} />
          </section>
        ) : null}

        <section aria-label="Notify-me requests" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Notify-me requests ({requests.length})</h2>
            {requests.length > 0 ? (
              <NotifyCsvButton productId={product.id} action={exportNotifyRequestsCsvAction} />
            ) : null}
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has asked to be notified yet.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {requests.map((r) => (
                <li key={`${r.email}-${r.type}`} className="flex flex-col p-2">
                  <span className="break-all">{r.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.type === "RESTOCK" ? "Restock / similar piece" : "Similar fabric"} ·{" "}
                    {dateFormat.format(r.createdAt)}
                    {r.notifiedAt ? ` · emailed ${dateFormat.format(r.notifiedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {requests.some((r) => r.type === "RESTOCK") ? (
            <p className="text-xs text-muted-foreground">
              Restock requests are emailed automatically, once, when you save this piece while
              it&apos;s published and in stock. Similar-fabric requests are for you to follow up:
              export them as CSV.
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
