import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { enabledProviders, signIn } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/route-access";

export const metadata: Metadata = { title: "Sign in" };

const DEFAULT_CALLBACK = "/account/wardrobe";

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
  const checkEmail = first(params["check-email"]) === "1";
  const error = first(params.error);

  async function emailSignIn(formData: FormData) {
    "use server";
    const email = z.email().safeParse(formData.get("email"));
    const redirectTo = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), DEFAULT_CALLBACK);
    if (!email.success) {
      const { redirect } = await import("next/navigation");
      redirect(`/sign-in?error=InvalidEmail&callbackUrl=${encodeURIComponent(redirectTo)}`);
    }
    await signIn("resend", { email: email.data, redirectTo });
  }

  async function googleSignIn(formData: FormData) {
    "use server";
    const redirectTo = safeCallbackUrl(String(formData.get("callbackUrl") ?? ""), DEFAULT_CALLBACK);
    await signIn("google", { redirectTo });
  }

  if (checkEmail) {
    return <p role="status">Check your email for a sign-in link.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error === "InvalidEmail"
            ? "Please enter a valid email address."
            : "Sign-in failed. Please try again."}
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
