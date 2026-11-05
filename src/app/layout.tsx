import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Cormorant_Garamond, Geist, Geist_Mono, Pinyon_Script } from "next/font/google";

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteHeader } from "@/components/layout/site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Elegant serif for the wordmark and headings. */
const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Delicate script for the tagline only. */
const script = Pinyon_Script({
  variable: "--font-script-face",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "DNA Stitches — Tailored to your DNA.",
    template: "%s · DNA Stitches",
  },
  description:
    "1-of-1 ready-to-wear pieces and made-to-measure custom tailoring from the DNA Stitches atelier.",
  appleWebApp: { title: "DNA Stitches", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e0d0b",
  colorScheme: "dark",
  // Lets the bottom tab bar sit above the iPhone home indicator (safe-area insets).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NG"
      style={{ colorScheme: "dark" }}
      className={`dark ${geistSans.variable} ${geistMono.variable} ${display.variable} ${script.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="content" className="flex flex-1 flex-col">
          {children}
        </div>
        {/* Reads the URL, so it renders at request time, apart from the static shell. */}
        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
      </body>
    </html>
  );
}
