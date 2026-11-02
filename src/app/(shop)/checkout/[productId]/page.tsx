import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { type CheckoutAddress, CheckoutForm } from "@/components/shop/checkout-form";
import { Button } from "@/components/ui/button";
import { resolveDeliveryFee } from "@/lib/delivery";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { startCheckoutAction } from "@/server/actions/checkout";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

/** US-A4: buy an available 1-of-1 piece. Sign-in required (proxy + requireUser). */
export default function CheckoutPage({ params }: PageProps<"/checkout/[productId]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading checkout…
          </p>
        }
      >
        <Checkout params={params} />
      </Suspense>
    </main>
  );
}

async function Checkout({ params }: Pick<PageProps<"/checkout/[productId]">, "params">) {
  const { productId } = await params;
  const user = await requireUser(`/checkout/${productId}`);
  const product = await prisma.product.findFirst({
    where: { id: productId, isPublished: true },
    select: {
      id: true,
      slug: true,
      name: true,
      priceKobo: true,
      inventoryStatus: true,
      sizeLabel: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
    },
  });
  if (!product) notFound();

  if (product.inventoryStatus === "SOLD_OUT") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>{product.name} has found its home. We can make one for you.</p>
        <Button asChild>
          <Link href={`/custom/request?fromProduct=${encodeURIComponent(product.id)}`}>
            Request Custom Version
          </Link>
        </Button>
      </div>
    );
  }

  const [addresses, zones] = await Promise.all([
    prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.deliveryZone.findMany({ where: { isActive: true } }),
  ]);
  const options: CheckoutAddress[] = addresses.map((a) => {
    const fee = resolveDeliveryFee(a.state, zones);
    return {
      id: a.id,
      summary: `${a.recipientName}, ${a.line1}, ${a.city}, ${a.state}`,
      isDefault: a.isDefault,
      delivery: fee.available
        ? { feeKobo: fee.feeKobo, etaDays: fee.etaDays, zoneName: fee.zoneName }
        : null,
    };
  });
  const image = product.images[0];

  return (
    <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-3">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {image ? (
            <Image src={image.url} alt={image.alt} fill sizes="256px" className="object-cover" />
          ) : null}
        </div>
        <div>
          <p className="font-medium">{product.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatNGN(product.priceKobo)}
            {product.sizeLabel ? ` · ${product.sizeLabel}` : ""}
          </p>
        </div>
      </aside>
      <CheckoutForm
        productId={product.id}
        priceKobo={product.priceKobo}
        addresses={options}
        studioAddress={env.STUDIO_ADDRESS ?? null}
        studioHours={env.STUDIO_HOURS ?? null}
        action={startCheckoutAction}
      />
    </div>
  );
}
