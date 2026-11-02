"use client";

import { Button } from "@/components/ui/button";

export default function ShopError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">
        We couldn&apos;t load the shop right now. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
