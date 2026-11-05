"use client";

import { House, Scissors, ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { href: "/shop", label: "Shop", icon: ShoppingBag, match: (p: string) => p.startsWith("/shop") },
  {
    href: "/custom",
    label: "Tailoring",
    icon: Scissors,
    match: (p: string) => p.startsWith("/custom"),
  },
  {
    href: "/account",
    label: "Profile",
    icon: UserRound,
    match: (p: string) => p.startsWith("/account") || p.startsWith("/sign-in"),
  },
] as const;

/**
 * App-style navigation fixed to the bottom of the screen on phones (hidden from `sm` up,
 * where the header nav takes over). Not shown in the admin, which has its own nav.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] tracking-[0.12em] uppercase transition-colors focus-visible:bg-accent focus-visible:outline-none",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={active ? 2 : 1.5} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
