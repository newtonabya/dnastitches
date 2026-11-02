"use client";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import type { ActionResult } from "@/server/actions/types";

import { type MeasurementDefaults, MeasurementFields } from "./measurement-fields";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Add a profile, or (with `profileId`) save an edited profile as a new version. */
export function MeasurementProfileForm({
  action,
  profileId,
  defaults,
  submitLabel,
}: {
  action: Action;
  profileId?: string;
  defaults?: MeasurementDefaults;
  submitLabel: string;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action, {
    resetOnSuccess: !profileId,
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {profileId ? <input type="hidden" name="profileId" value={profileId} /> : null}
      <MeasurementFields defaults={defaults} errors={fieldErrors} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="makeDefault" className="size-4" />
        Use as my default measurements
      </label>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
