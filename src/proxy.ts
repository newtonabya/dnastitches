import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";
import { getRouteAccess, signInUrl } from "@/lib/route-access";

// Adapter-free instance: decodes the JWT session cookie without touching the database.
const { auth } = NextAuth(authConfig);

/**
 * Next.js 16 Proxy (formerly `middleware.ts`, renamed upstream; see PRD §10 note).
 * - /account/*, /custom/request, /custom/book, /checkout/* → sign in, keeping callbackUrl.
 * - /admin/* → 404 for anyone who is not an admin (D-4).
 * Layouts and Server Actions re-check authorisation; this is the first line only.
 */
export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const access = getRouteAccess(pathname);
  const user = req.auth?.user;

  if (access === "admin" && user?.role !== "ADMIN") {
    // Rewrite to an unmatched path so Next renders not-found.tsx with a real 404 status.
    return NextResponse.rewrite(new URL("/__not-found", req.url));
  }

  if (access === "customer" && !user) {
    return NextResponse.redirect(new URL(signInUrl(`${pathname}${search}`), req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/custom/request/:path*",
    "/custom/book/:path*",
    "/checkout/:path*",
  ],
};
