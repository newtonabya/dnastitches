import type { Metadata } from "next";
import { Suspense } from "react";

import { SwatchForm } from "@/components/admin/catalog-forms";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { saveSwatchAction } from "@/server/actions/admin/catalog";
import { requireAdmin } from "@/server/auth/guards";
import { listAdminSwatches } from "@/server/data/admin/catalog";

export const metadata: Metadata = { title: "Fabric swatches" };

/** US-C3: manage fabric swatches. Swatches are hidden by making them unavailable, never deleted. */
export default function SwatchesPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Fabric swatches</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading swatches…
          </p>
        }
      >
        <Swatches />
      </Suspense>
    </main>
  );
}

async function Swatches() {
  await requireAdmin();
  const swatches = await listAdminSwatches(prisma);
  const uploadsEnabled = Boolean(env.BLOB_READ_WRITE_TOKEN);
  return (
    <>
      <ul className="flex flex-col gap-3">
        {swatches.map((s) => (
          <li key={s.id} className="rounded-lg border p-4">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span
                  aria-hidden
                  className="size-5 rounded-full border"
                  style={{ backgroundColor: s.colorHex }}
                />
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-muted-foreground">{s.composition}</span>
                {s.isAvailable ? (
                  <Badge variant="secondary">Available</Badge>
                ) : (
                  <Badge variant="outline">Hidden</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {s._count.products} products · {s._count.customOrders} custom orders
                </span>
              </summary>
              <div className="mt-4">
                <SwatchForm values={s} uploadsEnabled={uploadsEnabled} action={saveSwatchAction} />
              </div>
            </details>
          </li>
        ))}
      </ul>
      <section aria-label="Add a swatch" className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Add a swatch</h2>
        <SwatchForm
          values={{
            name: "",
            colorHex: "#000000",
            imageUrl: "",
            composition: "",
            isAvailable: true,
            sortOrder: swatches.length,
          }}
          uploadsEnabled={uploadsEnabled}
          action={saveSwatchAction}
        />
      </section>
    </>
  );
}
