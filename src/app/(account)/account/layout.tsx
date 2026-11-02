import { Suspense } from "react";

import { requireUser } from "@/server/auth/guards";

/**
 * Auth guard for /account/* (US-E1). The proxy redirects signed-out visitors first;
 * this re-checks on the server. Session reads must sit behind <Suspense> with Cache Components.
 */
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <Suspense fallback={<GuardFallback />}>
      <AccountGuard>{children}</AccountGuard>
    </Suspense>
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
