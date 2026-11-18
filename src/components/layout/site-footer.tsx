import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { env } from "@/lib/env";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "Ready-to-wear" },
      { href: "/shop?status=available", label: "Available now" },
      { href: "/policies/terms", label: "Terms of sale" },
    ],
  },
  {
    title: "Bespoke",
    links: [
      { href: "/custom", label: "How it works" },
      { href: "/custom/gallery", label: "Portfolio" },
      { href: "/custom/request", label: "Request a piece" },
      { href: "/custom/book", label: "Book a consultation" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/account/wardrobe", label: "My Wardrobe" },
      { href: "/account/appointments", label: "Appointments" },
      { href: "/account/measurements", label: "Measurements" },
    ],
  },
] as const;

/** Site-wide footer: the way around the site, and where to find the studio. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-primary/15 bg-card/40 text-sm">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Link href="/" className="flex items-center gap-2.5 self-start">
            <LogoMark className="h-9" />
            <span className="font-serif text-xl font-semibold tracking-wide">DNA Stitches</span>
          </Link>
          <p className="font-script text-2xl text-gold-soft">According to Ur DNA</p>
          <p className="max-w-sm text-muted-foreground">
            1-of-1 ready-to-wear and made-to-measure tailoring from our Lagos atelier.
          </p>
          <address className="flex flex-col gap-1 text-muted-foreground not-italic">
            <span>{env.STUDIO_ADDRESS ?? "Lagos, Nigeria"}</span>
            {env.STUDIO_HOURS ? <span>{env.STUDIO_HOURS}</span> : null}
          </address>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={`Footer: ${col.title}`} className="flex flex-col gap-3">
            <h2 className="text-xs tracking-[0.25em] text-primary uppercase">{col.title}</h2>
            <ul className="flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-primary/10">
        <p className="mx-auto w-full max-w-7xl px-4 py-5 text-xs text-muted-foreground">
          © DNA Stitches. All sales are final; custom deposits are non-refundable.
        </p>
      </div>
    </footer>
  );
}
