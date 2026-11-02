import type { Metadata } from "next";
import { Suspense } from "react";

import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin guard (US-C2 DoD): non-admins get a 404 (D-4). The proxy enforces this first;
 * every admin Server Action must also call `requireAdmin()`.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<GuardFallback />}>
      <AdminGuard>{children}</AdminGuard>
    </Suspense>
  );
}

async function AdminGuard({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}

function GuardFallback() {
  return (
    <p className="mx-auto w-full max-w-3xl px-4 py-12 text-sm text-muted-foreground" role="status">
      Loading…
    </p>
  );
}
