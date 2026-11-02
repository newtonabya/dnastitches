import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/guards";
import { getOwnCustomOrderByReference } from "@/server/data/custom-orders";

export const metadata: Metadata = { title: "Request received" };

/** US-B1 AC6: confirmation with the human-readable reference. */
export default function RequestSuccessPage({ searchParams }: PageProps<"/custom/request/success">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        }
      >
        <Confirmation searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Confirmation({
  searchParams,
}: Pick<PageProps<"/custom/request/success">, "searchParams">) {
  const user = await requireUser("/account/wardrobe");
  const params = await searchParams;
  const ref = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const order = ref ? await getOwnCustomOrderByReference(prisma, user.id, ref) : null;

  if (!order) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          We couldn&apos;t find that request
        </h1>
        <Button asChild variant="outline">
          <Link href="/account/wardrobe">Go to My Wardrobe</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">Request received</p>
      <h1 className="text-3xl font-semibold tracking-tight">Thank you!</h1>
      <p>
        Your reference is{" "}
        <strong data-testid="order-reference" className="font-mono">
          {order.reference}
        </strong>
        .
      </p>
      <p className="text-sm text-muted-foreground">
        We&apos;ve emailed you a copy. We&apos;ll review &ldquo;{order.title}&rdquo;. To talk it
        through, book a consultation in the studio or by video.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={`/custom/book?order=${order.id}`}>Book a consultation</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/account/wardrobe">Track it in My Wardrobe</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/shop">Keep browsing</Link>
        </Button>
      </div>
    </div>
  );
}
