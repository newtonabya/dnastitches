import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/generated/prisma/enums";

/**
 * Adapter-free Auth.js config shared by `auth.ts` and `src/proxy.ts`.
 * Contains no database access so the proxy stays cheap on every request.
 */
export const authConfig = {
  // Required behind proxies and for self-hosting; Vercel sets this automatically.
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?check-email=1",
    error: "/sign-in",
  },
  // JWT sessions let the proxy authorise requests without a DB round trip.
  // The Prisma adapter still persists users, accounts and verification tokens.
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user.role ?? "CUSTOMER") as Role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role ?? "CUSTOMER";
      return session;
    },
  },
} satisfies NextAuthConfig;
