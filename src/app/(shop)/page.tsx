import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { LogoLockup } from "@/components/brand/logo";
import { BespokeSteps } from "@/components/custom/bespoke-steps";
import { Stars } from "@/components/reviews/stars";
import { ProductCard } from "@/components/shop/product-card";
import { Button } from "@/components/ui/button";
import { HERO_TAG } from "@/lib/portfolio";
import { getPortfolio } from "@/server/loaders/portfolio";
import { getShopProducts } from "@/server/loaders/products";
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
          {/* The logo is the heading: its alt text, "DNA Stitches", is the page's h1. */}
          <h1
            id="hero-heading"
            className="w-72 drop-shadow-[0_0_28px_oklch(0.8_0.115_85/0.25)] sm:w-[28rem]"
          >
            <LogoLockup priority />
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
        <NewArrivals />
      </Suspense>

      <section
        aria-labelledby="bespoke-heading"
        className="border-y border-primary/15 bg-card/40 py-14 sm:py-20"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4">
          <SectionHeading
            id="bespoke-heading"
            eyebrow="Made to measure"
            title="How bespoke works"
            blurb="From your first idea to the final fitting, every step is tracked in your account."
          />
          <BespokeSteps />
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/custom/book">Book a consultation</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/custom/gallery">See the portfolio</Link>
            </Button>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <Testimonials />
      </Suspense>
    </main>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  blurb,
}: {
  id: string;
  eyebrow: string;
  title: string;
  blurb?: string;
}) {
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      <p className="text-xs tracking-[0.3em] text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="text-3xl font-medium tracking-wide sm:text-4xl">
        {title}
      </h2>
      {blurb ? <p className="max-w-xl text-sm text-muted-foreground">{blurb}</p> : null}
    </header>
  );
}

/** The newest pieces still for sale: a taste of the shop on the home page. */
async function NewArrivals() {
  const { items } = await getShopProducts({ status: "available", page: 1 });
  const pieces = items.slice(0, 4);
  if (pieces.length === 0) return null;
  return (
    <section
      aria-labelledby="arrivals-heading"
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 sm:pb-20"
    >
      <SectionHeading
        id="arrivals-heading"
        eyebrow="Ready-to-wear"
        title="New arrivals"
        blurb="Every piece is 1-of-1. When it's gone, it's gone."
      />
      <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {pieces.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
      <div className="flex justify-center">
        <Button asChild variant="outline" size="lg">
          <Link href="/shop">View the whole shop</Link>
        </Button>
      </div>
    </section>
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
  const hero = (await getPortfolio(HERO_TAG))[0] ?? (await getPortfolio())[0];
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
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:py-20"
    >
      <SectionHeading id="testimonials-heading" eyebrow="Reviews" title="What our clients say" />
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
