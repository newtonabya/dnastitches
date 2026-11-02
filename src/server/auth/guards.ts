import "server-only";

import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signInUrl } from "@/lib/route-access";

/**
 * Require a signed-in user; otherwise redirect to sign-in with a callback URL.
 * Use at the top of customer layouts, pages and Server Actions.
 */
export async function requireUser(callbackPath = "/account") {
  // Session reads are request-time only (Auth.js uses crypto); opt out of prerendering.
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect(signInUrl(callbackPath));
  return session.user;
}

/**
 * Require an admin. Non-admins (including signed-out visitors) get a 404 (D-4).
 * Re-reads the role from the database so a demoted admin loses access immediately,
 * even while their JWT is still valid.
 */
export async function requireAdmin() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) notFound();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (user?.role !== "ADMIN") notFound();
  return user;
}
