import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNGN } from "@/lib/money";
import { PAYMENT_REFERENCE_RE } from "@/lib/payments/reference";
import { prisma } from "@/lib/prisma";
import { devDecidePaymentAction } from "@/server/actions/dev-payments";
import { isDevPaymentsEnabled } from "@/server/payments/provider";

export const metadata: Metadata = { title: "Dev payment", robots: { index: false } };

/**
 * Local stand-in for the Paystack checkout page, used only when PAYSTACK_SECRET_KEY
 * is not set (development and E2E tests). 404 everywhere else.
 */
export default function DevPaystackPage({ searchParams }: PageProps<"/dev/paystack">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Suspense fallback={null}>
        <DevGateway searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function DevGateway({ searchParams }: Pick<PageProps<"/dev/paystack">, "searchParams">) {
  await connection();
  if (!isDevPaymentsEnabled()) notFound();
  const raw = (await searchParams).reference;
  const reference = typeof raw === "string" && PAYMENT_REFERENCE_RE.test(raw) ? raw : null;
  const payment = reference
    ? await prisma.payment.findUnique({
        where: { paystackReference: reference },
        select: { status: true, amountKobo: true, kind: true },
      })
    : null;
  if (!reference || !payment) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight">Dev payment gateway</h1>
        </CardTitle>
        <CardDescription>
          Paystack isn&apos;t configured (no PAYSTACK_SECRET_KEY), so this page stands in for it.
          Nothing is charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-3xl font-semibold tabular-nums">{formatNGN(payment.amountKobo)}</p>
        <p className="text-sm text-muted-foreground">
          {payment.kind.replace(/_/g, " ").toLowerCase()} · status {payment.status.toLowerCase()} ·{" "}
          {reference}
        </p>
        {payment.status === "PENDING" ? (
          <div className="flex flex-wrap gap-3">
            <form action={devDecidePaymentAction}>
              <input type="hidden" name="reference" value={reference} />
              <input type="hidden" name="outcome" value="success" />
              <Button type="submit">Simulate successful payment</Button>
            </form>
            <form action={devDecidePaymentAction}>
              <input type="hidden" name="reference" value={reference} />
              <input type="hidden" name="outcome" value="abandoned" />
              <Button type="submit" variant="outline">
                Cancel payment
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm">This payment is no longer pending.</p>
        )}
      </CardContent>
    </Card>
  );
}
