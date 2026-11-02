import type { Metadata } from "next";
import { Suspense } from "react";

import { MeasurementProfileCard } from "@/components/account/measurement-profile-card";
import { MeasurementProfileForm } from "@/components/account/measurement-profile-form";
import { prisma } from "@/lib/prisma";
import {
  createMeasurementProfileAction,
  setDefaultMeasurementProfileAction,
  updateMeasurementProfileAction,
} from "@/server/actions/measurements";
import { requireUser } from "@/server/auth/guards";
import { listCurrentProfiles } from "@/server/data/measurements";

export const metadata: Metadata = { title: "My measurements" };

/** US-B3: view, add, version and set a default measurement profile. */
export default function MeasurementsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">My measurements</h1>
        <p className="text-sm text-muted-foreground">
          Saved measurements are reused for custom requests. Editing keeps the previous version on
          file with the atelier.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading your measurements…
          </p>
        }
      >
        <MeasurementsContent />
      </Suspense>
    </main>
  );
}

async function MeasurementsContent() {
  const user = await requireUser("/account/measurements");
  const profiles = await listCurrentProfiles(prisma, user.id);

  return (
    <>
      <section aria-labelledby="profiles-heading" className="flex flex-col gap-4">
        <h2 id="profiles-heading" className="text-xl font-semibold">
          Saved profiles
        </h2>
        {profiles.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <MeasurementProfileCard
                  profile={profile}
                  update={updateMeasurementProfileAction}
                  setDefault={setDefaultMeasurementProfileAction}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No measurements yet. Add your first profile below.
          </p>
        )}
      </section>
      <section aria-labelledby="add-heading" className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 id="add-heading" className="text-xl font-semibold">
          Add measurements
        </h2>
        <MeasurementProfileForm
          action={createMeasurementProfileAction}
          submitLabel="Save measurements"
        />
      </section>
    </>
  );
}
