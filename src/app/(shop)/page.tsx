import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">DNA Stitches</h1>
      <p className="text-lg text-muted-foreground">Tailored to your DNA.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/shop">Shop 1-of-1 pieces</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/custom">Start a custom piece</Link>
        </Button>
      </div>
    </main>
  );
}
