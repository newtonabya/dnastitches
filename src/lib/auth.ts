import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/lib/auth.config";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const providers: Provider[] = [
  Resend({
    apiKey: env.AUTH_RESEND_KEY,
    from: env.EMAIL_FROM ?? "DNA Stitches <onboarding@resend.dev>",
  }),
];

if (env.googleAuthEnabled) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      // Safe: Google verifies email ownership, and both providers resolve to the same User row.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/** Provider ids rendered on the sign-in page. */
export const enabledProviders = providers.map((p) => (typeof p === "function" ? p().id : p.id));

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && env.ADMIN_EMAILS.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  // The adapter is typed against the default `@prisma/client` output; this project
  // generates the client into src/generated/prisma (Prisma 7), which is structurally
  // identical. The cast is limited to this call site.
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const { user } = params;
      // First admin(s) are assigned via ADMIN_EMAILS, never via the UI (US-E1 AC2).
      if (user?.id && user.role !== "ADMIN" && isAdminEmail(user.email)) {
        await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
        user.role = "ADMIN";
      }
      return authConfig.callbacks.jwt(params);
    },
  },
});
