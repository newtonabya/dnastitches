import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { DemoSignInForm, type DemoSignInState } from "@/components/auth/demo-sign-in-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { enabledProviders, signIn } from "@/lib/auth";
import { demoLinkCapture, isDemoPasscode } from "@/lib/demo-access";
import { env } from "@/lib/env";
import { allowSignInEmail, demoSignInRateLimiter, getClientIp } from "@/lib/rate-limit";
import { safeCallbackUrl } from "@/lib/route-access";

export const metadata: Metadata = { title: "Sign in" };

const DEFAULT_CALLBACK = "/account/wardrobe";

/** Friendly messages for our own and Auth.js error codes (https://authjs.dev/reference/core/errors). */
const SIGN_IN_ERRORS: Record<string, string> = {
  InvalidEmail: "Please enter a valid email address.",
  Verification: "That sign-in link has expired or was already used. Request a new one below.",
  OAuthAccountNotLinked:
    "This email is already linked to another sign-in method. Use the email link instead.",
  AccessDenied: "Access denied.",
  RateLimited: "Too many sign-in emails were requested. Please wait a few minutes and try again.",
  DemoCode: "That demo passcode isn't right.",
  DemoRateLimited: "Too many demo sign-in attempts. Please wait a few minutes and try again.",
};

/**
 * Minimal sign-in screen so Auth.js wiring can be verified end to end.
 * Full UX (US-E1) is implemented in its own story.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to DNA Stitches</h1>
          </CardTitle>
          <CardDescription>
            Use a magic link sent to your email, or continue with Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <SignInForms searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function SignInForms({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const callbackUrl = safeCallbackUrl(first(params.callbackUrl), DEFAULT_CALLBACK);
  const error = first(params.error);

  async function emailSignIn(formData: FormData) {
    "use server";
    const email = z.email().safeParse(formData.get("email"));
    const redirectTo = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), DEFAULT_CALLBACK);
    if (!email.success) {
      const { redirect } = await import("next/navigation");
      redirect(`/sign-in?error=InvalidEmail&callbackUrl=${encodeURIComponent(redirectTo)}`);
      return;
    }
    const { headers } = await import("next/headers");
    const allowed = await allowSignInEmail(email.data, getClientIp(await headers()), {
      production: process.env.NODE_ENV === "production",
    });
    if (!allowed) {
      const { redirect } = await import("next/navigation");
      redirect(`/sign-in?error=RateLimited&callbackUrl=${encodeURIComponent(redirectTo)}`);
    }
    await signIn("resend", { email: email.data, redirectTo });
  }

  /** Demo sign-in: email + DEMO_ACCESS_CODE, no email sent (see src/lib/demo-access.ts). */
  async function demoSignIn(_state: DemoSignInState, formData: FormData): Promise<DemoSignInState> {
    "use server";
    const fail = (code: string) => ({
      error: SIGN_IN_ERRORS[code] ?? "Sign-in failed. Please try again.",
    });
    if (!env.DEMO_ACCESS_CODE) return fail("AccessDenied");
    const redirectTo = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), DEFAULT_CALLBACK);
    const { headers } = await import("next/headers");
    const ip = getClientIp(await headers());
    if (!(await demoSignInRateLimiter.limit(`demo:ip:${ip}`)).success)
      return fail("DemoRateLimited");
    const email = z.email().safeParse(
      String(formData.get("email") ?? "")
        .trim()
        .toLowerCase(),
    );
    if (!email.success) return fail("InvalidEmail");
    if (!isDemoPasscode(String(formData.get("passcode") ?? ""), env.DEMO_ACCESS_CODE))
      return fail("DemoCode");

    const captured: { url?: string } = {};
    await demoLinkCapture.run(captured, () =>
      signIn("resend", { email: email.data, redirectTo, redirect: false }),
    );
    if (!captured.url) return fail("Configuration");
    console.info(`[auth] Demo sign-in used for ${email.data}`);
    return { url: captured.url };
  }

  async function googleSignIn(formData: FormData) {
    "use server";
    const redirectTo = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), DEFAULT_CALLBACK);
    await signIn("google", { redirectTo });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {SIGN_IN_ERRORS[error] ?? "Sign-in failed. Please try again."}
        </p>
      ) : null}
      <form action={emailSignIn} className="flex flex-col gap-3">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <Button type="submit">Email me a sign-in link</Button>
      </form>
      {env.DEMO_ACCESS_CODE ? (
        <DemoSignInForm callbackUrl={callbackUrl} action={demoSignIn} />
      ) : null}
      {enabledProviders.includes("google") ? (
        <form action={googleSignIn}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
      ) : null}
    </div>
  );
}
