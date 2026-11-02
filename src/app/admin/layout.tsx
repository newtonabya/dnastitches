import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · DNA Stitches" },
  robots: { index: false, follow: false },
};

/**
 * Admin guard (US-C2 DoD): non-admins get a 404 (D-4). The proxy enforces this first;
 * every admin page loader and Server Action re-checks (`requireAdmin`,
 * `getAdminForAction`). The admin nav renders only after the check passes.
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
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}

function GuardFallback() {
  return (
    <p className="mx-auto w-full max-w-3xl px-4 py-12 text-sm text-muted-foreground" role="status">
      Loading…
    </p>
  );
}
