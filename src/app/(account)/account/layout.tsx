import Link from "next/link";
import { Suspense } from "react";

import { requireUser } from "@/server/auth/guards";

const ACCOUNT_NAV = [
  { href: "/account/wardrobe", label: "My Wardrobe" },
  { href: "/account/measurements", label: "Measurements" },
  { href: "/account/profile", label: "Profile" },
] as const;

/**
 * Auth guard for /account/* (US-E1). The proxy redirects signed-out visitors first;
 * this re-checks on the server. Pages that read data must also call `requireUser()`.
 */
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <>
      <nav aria-label="Account sections" className="border-b">
        <ul className="mx-auto flex w-full max-w-7xl gap-6 overflow-x-auto px-4 text-sm">
          {ACCOUNT_NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="inline-block py-3 hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense fallback={<GuardFallback />}>
        <AccountGuard>{children}</AccountGuard>
      </Suspense>
    </>
  );
}

async function AccountGuard({ children }: { children: React.ReactNode }) {
  await requireUser("/account");
  return <>{children}</>;
}

function GuardFallback() {
  return (
    <p className="mx-auto w-full max-w-3xl px-4 py-12 text-sm text-muted-foreground" role="status">
      Loading your account…
    </p>
  );
}
