import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Admin check for Server Actions (US-C2 DoD: re-checked in every admin action).
 * Reads the role from the database so a demoted admin is refused immediately.
 * Returns null instead of throwing so actions can answer with a normal result.
 */
export async function getAdminForAction(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  return user?.role === "ADMIN" ? { id: user.id } : null;
}
