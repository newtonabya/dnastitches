"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MEASUREMENT_FIELDS } from "@/lib/validators/measurements";
import type {
  setDefaultMeasurementProfileAction,
  updateMeasurementProfileAction,
} from "@/server/actions/measurements";
import type { ActionResult } from "@/server/actions/types";
import type { MeasurementProfileView } from "@/server/data/measurements";

import { MeasurementProfileForm } from "./measurement-profile-form";

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

export function MeasurementProfileCard({
  profile,
  update,
  setDefault,
}: {
  profile: MeasurementProfileView;
  update: typeof updateMeasurementProfileAction;
  setDefault: typeof setDefaultMeasurementProfileAction;
}) {
  const [defaultState, defaultAction, pending] = useActionState<ActionResult | null, FormData>(
    setDefault,
    null,
  );
  const unit = profile.unit === "CM" ? "cm" : "in";

  return (
    <article
      aria-label={`Measurements: ${profile.label}`}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{profile.label}</h3>
          <p className="text-xs text-muted-foreground">
            {dateFormat.format(profile.createdAt)} · {unit} · Taken by{" "}
            {profile.takenBy === "ADMIN" ? "Atelier" : "Self"}
            {profile.previousVersionId ? " · Updated version" : ""}
          </p>
        </div>
        {profile.isDefault ? <Badge variant="secondary">Default</Badge> : null}
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {MEASUREMENT_FIELDS.filter((f) => profile[f.key] !== null).map((f) => (
          <div key={f.key}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="tabular-nums">
              {profile[f.key]} {unit}
            </dd>
          </div>
        ))}
      </dl>
      {profile.notes ? <p className="text-sm text-muted-foreground">{profile.notes}</p> : null}

      <div className="flex flex-wrap gap-2">
        {!profile.isDefault ? (
          <form action={defaultAction}>
            <input type="hidden" name="profileId" value={profile.id} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Make default
            </Button>
          </form>
        ) : null}
      </div>
      {defaultState && !defaultState.ok ? <FormMessage state={defaultState} /> : null}

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">Edit (saves a new version)</summary>
        <div className="mt-4">
          <MeasurementProfileForm
            action={update}
            profileId={profile.id}
            defaults={profile}
            submitLabel="Save new version"
          />
        </div>
      </details>
    </article>
  );
}
