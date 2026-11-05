import type { Metadata } from "next";
import { Suspense } from "react";

import { AddressCard } from "@/components/account/address-card";
import { AddressForm } from "@/components/account/address-form";
import { ProfileForm } from "@/components/account/profile-form";
import { prisma } from "@/lib/prisma";
import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateProfileAction,
} from "@/server/actions/account";
import { requireUser } from "@/server/auth/guards";
import { getAccountProfile } from "@/server/data/account";

export const metadata: Metadata = { title: "Profile" };

/** US-E1 AC4: name, phone (+234) and delivery addresses. */
export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading your profile…
          </p>
        }
      >
        <ProfileContent />
      </Suspense>
    </main>
  );
}

async function ProfileContent() {
  const user = await requireUser("/account/profile");
  const profile = await getAccountProfile(prisma, user.id);
  if (!profile)
    return <p role="alert">We couldn&apos;t find your account. Please sign in again.</p>;

  return (
    <>
      <section aria-labelledby="details-heading" className="flex flex-col gap-4">
        <h2 id="details-heading" className="text-xl font-semibold">
          Your details
        </h2>
        <ProfileForm
          email={profile.email}
          name={profile.name}
          phone={profile.phone}
          smsReminders={profile.smsReminders}
          action={updateProfileAction}
        />
      </section>

      <section aria-labelledby="addresses-heading" className="flex flex-col gap-4">
        <h2 id="addresses-heading" className="text-xl font-semibold">
          Delivery addresses
        </h2>
        {profile.addresses.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {profile.addresses.map((address) => (
              <li key={address.id}>
                <AddressCard
                  address={address}
                  setDefault={setDefaultAddressAction}
                  remove={deleteAddressAction}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t added a delivery address yet.
          </p>
        )}
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 font-medium">Add an address</h3>
          <AddressForm action={createAddressAction} />
        </div>
      </section>
    </>
  );
}
