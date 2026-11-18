import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-4 py-20 text-center">
      <p className="font-serif text-6xl text-primary">404</p>
      <h1 className="text-3xl font-medium tracking-wide">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist or is no longer available. If you followed a link to a piece,
        it may have found its new home.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/shop">Browse the shop</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/custom">Made to measure</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
