import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Stars } from "@/components/reviews/stars";
import { getPortfolio } from "@/server/loaders/portfolio";
import { getTestimonials } from "@/server/loaders/reviews";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        aria-labelledby="hero-heading"
        className="relative isolate flex min-h-[78vh] items-end overflow-hidden border-b"
      >
        <Suspense fallback={<HeroBackdrop />}>
          <HeroPhoto />
        </Suspense>
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-5 px-4 pt-24 pb-16 text-center sm:pb-20">
          <Logo className="size-20 drop-shadow-[0_0_24px_oklch(0.8_0.115_85/0.35)] sm:size-24" />
          <h1
            id="hero-heading"
            className="text-5xl font-medium tracking-[0.06em] text-foreground sm:text-7xl"
          >
            DNA Stitches
          </h1>
          <p className="font-script text-3xl text-gold-soft sm:text-4xl">According to Ur DNA</p>
          <span
            aria-hidden
            className="h-px w-24 bg-gradient-to-r from-transparent via-primary to-transparent"
          />
          <p className="max-w-md text-sm text-foreground/85">
            1-of-1 ready-to-wear and made-to-measure tailoring from our Lagos atelier.
          </p>
        </div>
      </section>

      <nav aria-label="Start here" className="mx-auto w-full max-w-7xl px-4 py-12 sm:py-16">
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          <li>
            <PathLink
              href="/custom"
              title="Bespoke Tailoring"
              blurb="Made to your measurements, from consultation to final fitting."
            />
          </li>
          <li>
            <PathLink
              href="/shop"
              title="Shop Ready-to-Wear"
              blurb="One-of-a-kind pieces, ready to wear. When it's gone, it's gone."
            />
          </li>
        </ul>
      </nav>

      <Suspense fallback={null}>
        <Testimonials />
      </Suspense>
    </main>
  );
}

/** One of the two ways in: a large gold-edged panel. The whole panel is the link. */
function PathLink({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col items-center gap-3 rounded-md border border-primary/40 bg-card px-6 py-10 text-center transition-colors hover:border-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="font-serif text-3xl font-medium tracking-wide text-primary">{title}</span>
      <span className="max-w-xs text-sm text-muted-foreground">{blurb}</span>
      <span
        aria-hidden
        className="mt-2 text-xs tracking-[0.25em] text-foreground uppercase transition-transform group-hover:translate-x-1"
      >
        Enter →
      </span>
    </Link>
  );
}

/**
 * The hero photograph: the portfolio piece tagged "hero" (the owner chooses it in
 * Admin → Portfolio), else the newest portfolio piece, else the plain gold-on-black backdrop.
 */
async function HeroPhoto() {
  const hero = (await getPortfolio("hero"))[0] ?? (await getPortfolio())[0];
  return (
    <>
      <HeroBackdrop />
      {hero ? (
        <Image
          src={hero.imageUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover object-[center_25%] opacity-70"
        />
      ) : null}
      {/* Keeps the text legible on any photo. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/55 to-background/10"
      />
    </>
  );
}

function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_50%_30%,oklch(0.8_0.115_85/0.22),transparent_60%),radial-gradient(ellipse_at_50%_120%,oklch(0.3_0.02_80),oklch(0.12_0.004_80))]"
    />
  );
}

/** US-H1 AC3: approved 4–5 star reviews (cached; refreshed when the owner moderates). */
async function Testimonials() {
  const testimonials = await getTestimonials();
  if (testimonials.length === 0) return null;
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-20"
    >
      <h2 id="testimonials-heading" className="text-center text-3xl font-medium tracking-wide">
        What our clients say
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((t) => (
          <li key={t.id}>
            <figure className="flex h-full flex-col gap-3 rounded-md border bg-card p-6 text-sm">
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
