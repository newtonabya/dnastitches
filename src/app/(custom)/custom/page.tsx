import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BespokeSteps } from "@/components/custom/bespoke-steps";

export const metadata: Metadata = {
  title: "Custom tailoring",
  description:
    "Made-to-measure pieces from the DNA Stitches atelier: share your idea, pick a fabric, and track every step.",
};

export default function CustomLandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">Made to your measurements</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Every custom piece is cut for you. Tell us what you have in mind, and track it from first
          sketch to final fitting.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/custom/request">Start a custom request</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/custom/book">Book a consultation</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/custom/gallery">Browse the portfolio</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          You&apos;ll need to sign in so we can keep your measurements and orders together.
        </p>
      </section>
      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-2xl font-semibold">
          How it works
        </h2>
        <BespokeSteps />
      </section>
    </main>
  );
}
