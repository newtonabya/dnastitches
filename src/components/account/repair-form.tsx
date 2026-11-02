"use client";

import { useId, useState } from "react";

import { ImageUploader } from "@/components/custom/image-uploader";
import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { MAX_REPAIR_PHOTOS } from "@/lib/uploads";
import type { createRepairRequest } from "@/server/actions/repairs";

/** US-D3 AC2: describe the defect and attach up to 3 photos. */
export function RepairForm({
  kind,
  targetId,
  pathPrefix,
  uploadsEnabled,
  action,
}: {
  kind: "ORDER" | "CUSTOM_ORDER";
  targetId: string;
  pathPrefix: string;
  uploadsEnabled: boolean;
  action: typeof createRepairRequest;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const [photos, setPhotos] = useState<string[]>([]);
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Report a defect"
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetId" value={targetId} />
      {photos.map((url) => (
        <input key={url} type="hidden" name="photoUrls" value={url} />
      ))}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          What&apos;s wrong?
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={5}
          maxLength={2000}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={`${id}-hint${fieldErrors.description ? ` ${id}-error` : ""}`}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          For example: where the defect is, and when you first noticed it.
        </p>
        {fieldErrors.description ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {fieldErrors.description}
          </p>
        ) : null}
      </div>
      <ImageUploader
        urls={photos}
        onChange={setPhotos}
        pathPrefix={pathPrefix}
        uploadsEnabled={uploadsEnabled}
        error={fieldErrors.photoUrls}
        label="Photos"
        itemLabel="Photo"
        max={MAX_REPAIR_PHOTOS}
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}
