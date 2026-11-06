"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DemoSignInState = { error: string } | { url: string } | null;

/**
 * The demo passcode form. On success the action hands back the one-time sign-in link and
 * the browser opens it directly: a server-side redirect to it would let Next.js fetch the
 * link itself first, using up the token before the browser arrives.
 */
export function DemoSignInForm({
  callbackUrl,
  action,
}: {
  callbackUrl: string;
  action: (state: DemoSignInState, formData: FormData) => Promise<DemoSignInState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const url = state && "url" in state ? state.url : null;

  useEffect(() => {
    if (url) window.location.assign(url);
  }, [url]);

  return (
    <form
      action={formAction}
      aria-label="Demo sign-in"
      className="flex flex-col gap-3 rounded-md border border-primary/40 p-4"
    >
      <p className="text-sm">
        <span className="font-medium text-primary">Demo access is on.</span>{" "}
        <span className="text-muted-foreground">
          Testers can sign in with the demo passcode instead of an email link.
        </span>
      </p>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label htmlFor="demo-email" className="text-sm font-medium">
        Email
      </label>
      <Input id="demo-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="demo-passcode" className="text-sm font-medium">
        Demo passcode
      </label>
      <Input id="demo-passcode" name="passcode" type="password" autoComplete="off" required />
      <Button type="submit" variant="outline" disabled={pending || Boolean(url)}>
        {url ? "Signing you in…" : "Sign in with demo passcode"}
      </Button>
    </form>
  );
}
