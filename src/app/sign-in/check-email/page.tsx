import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Check your email" };

/** Auth.js `verifyRequest` page, shown after a magic link is sent. */
export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p role="status">Check your email for a sign-in link. It expires in 24 hours.</p>
          <p className="text-muted-foreground">
            Didn&apos;t get it? Check your spam folder, or{" "}
            <Link href="/sign-in" className="underline">
              try again
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
