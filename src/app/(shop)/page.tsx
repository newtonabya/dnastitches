import Link from "next/link";
import { Suspense } from "react";

import { Stars } from "@/components/reviews/stars";
import { Button } from "@/components/ui/button";
import { getTestimonials } from "@/server/loaders/reviews";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-16 px-4 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
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
      </section>
      <Suspense fallback={null}>
        <Testimonials />
      </Suspense>
    </main>
  );
}

/** US-H1 AC3: approved 4–5 star reviews (cached; refreshed when the owner moderates). */
async function Testimonials() {
  const testimonials = await getTestimonials();
  if (testimonials.length === 0) return null;
  return (
    <section aria-labelledby="testimonials-heading" className="flex w-full flex-col gap-6">
      <h2 id="testimonials-heading" className="text-center text-2xl font-semibold tracking-tight">
        What our clients say
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((t) => (
          <li key={t.id}>
            <figure className="flex h-full flex-col gap-3 rounded-lg border p-5 text-sm">
              <Stars rating={t.rating} />
              <blockquote className="line-clamp-6 flex-1 whitespace-pre-line">{t.body}</blockquote>
              <figcaption className="text-muted-foreground">
                {t.displayName}
                {t.product ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link href={`/shop/${t.product.slug}`} className="underline">
                      {t.product.name}
                    </Link>
                  </>
                ) : t.customOrderId ? (
                  <> · custom piece</>
                ) : null}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
