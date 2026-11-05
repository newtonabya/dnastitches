import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/server/actions/auth";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/custom", label: "Custom" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="size-9 sm:hidden" />
            <Logo className="hidden size-9 sm:block" />
            <span className="sr-only font-serif text-xl font-semibold tracking-wide whitespace-nowrap sm:not-sr-only">
              DNA Stitches
            </span>
          </Link>
          <nav aria-label="Main" className="hidden sm:block">
            <ul className="flex items-center gap-4 text-xs tracking-[0.18em] uppercase">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-primary">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <Suspense fallback={<div className="h-8 w-20" aria-hidden />}>
          <AccountMenu />
        </Suspense>
      </div>
    </header>
  );
}

/** Session-dependent part of the header; streams in at request time. */
async function AccountMenu() {
  await connection();
  const session = await auth();
  if (!session?.user) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }
  return (
    <nav aria-label="Account">
      <ul className="flex items-center gap-3 text-sm">
        {session.user.role === "ADMIN" ? (
          <li>
            <Link href="/admin" className="hover:underline">
              Admin
            </Link>
          </li>
        ) : null}
        <li>
          <Link href="/account/wardrobe" className="hover:underline">
            My account
          </Link>
        </li>
        <li>
          <form action={signOutAction}>
            <Button type="submit" size="sm" variant="ghost">
              Sign out
            </Button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
