import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Custom tailoring",
  description:
    "Made-to-measure pieces from the DNA Stitches atelier: share your idea, pick a fabric, and track every step.",
};

const STEPS = [
  {
    title: "Share your idea",
    body: "Describe the piece, add up to 5 reference images and tell us the occasion.",
  },
  { title: "Pick a fabric", body: "Choose from our swatches, or let us advise you." },
  {
    title: "Measurements",
    body: "Use saved measurements, enter new ones, or book a measurement appointment.",
  },
  {
    title: "Quote & deposit",
    body: "We send a quote. Production starts once the deposit is paid.",
  },
  {
    title: "Fittings & handover",
    body: "Follow progress in My Wardrobe, then collect or get it delivered.",
  },
] as const;

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
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-lg border p-4">
              <span className="text-sm text-muted-foreground">Step {i + 1}</span>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
