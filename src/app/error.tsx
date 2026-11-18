"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Any page that fails to render: a calm apology, a retry, and a way back. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-4 py-20 text-center">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">Something went wrong</p>
      <h1 className="text-3xl font-medium tracking-wide sm:text-4xl">
        We couldn&apos;t load this page
      </h1>
      <p className="text-muted-foreground">
        Please try again. If it keeps happening, wait a minute and come back; nothing you saved has
        been lost.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
