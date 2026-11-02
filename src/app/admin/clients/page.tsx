import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNigerianPhone } from "@/lib/nigeria";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth/guards";
import { searchClients } from "@/server/data/admin/clients";

export const metadata: Metadata = { title: "Clients" };

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

/** US-C2 AC1: client list with search by name, email or phone. */
export default function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading clients…
          </p>
        }
      >
        <Clients searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Clients({ searchParams }: Pick<PageProps<"/admin/clients">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.slice(0, 100) ?? "";
  const clients = await searchClients(prisma, q);

  return (
    <div className="flex flex-col gap-6">
      <form role="search" action="/admin/clients" className="flex max-w-xl gap-2">
        <label htmlFor="client-search" className="sr-only">
          Search clients by name, email or phone
        </label>
        <Input id="client-search" name="q" defaultValue={q} placeholder="Name, email or phone" />
        <Button type="submit">Search</Button>
      </form>
      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q ? `No clients match “${q}”.` : "No clients yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Clients</caption>
            <thead className="bg-muted/40 text-left">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Name
                </th>
                <th scope="col" className="p-3 font-medium">
                  Email
                </th>
                <th scope="col" className="p-3 font-medium">
                  Phone
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  Custom orders
                </th>
                <th scope="col" className="p-3 font-medium">
                  Last activity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="p-3">
                    <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">
                      {c.name ?? "(no name)"}
                    </Link>
                  </td>
                  <td className="p-3">{c.email}</td>
                  <td className="p-3">{c.phone ? formatNigerianPhone(c.phone) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{c.customOrderCount}</td>
                  <td className="p-3 text-muted-foreground">
                    {dateFormat.format(c.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
