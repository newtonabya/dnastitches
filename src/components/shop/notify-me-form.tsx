"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import type { createNotificationRequest } from "@/server/actions/notification-request";

/** US-D2: email + "Restock / similar piece" and "Similar fabric" checkboxes. */
export function NotifyMeForm({
  productId,
  defaultEmail,
  action,
}: {
  productId: string;
  defaultEmail?: string | null;
  action: typeof createNotificationRequest;
}) {
  const { state, pending, formRef, onSubmit, fieldErrors: errors } = useFormAction(action);
  const id = useId();
  const emailErrorId = `${id}-email-error`;
  const typesErrorId = `${id}-types-error`;

  if (state?.ok) {
    return (
      <p role="status" className="rounded-md bg-muted p-4 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-labelledby={`${id}-title`}
    >
      <div>
        <h2 id={`${id}-title`} className="font-semibold">
          Notify me
        </h2>
        <p className="text-sm text-muted-foreground">
          Get an email if this style returns or a similar fabric arrives.
        </p>
      </div>
      <input type="hidden" name="productId" value={productId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="text-sm font-medium">
          Email
        </label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail ?? ""}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? emailErrorId : undefined}
          required
        />
        {errors.email ? (
          <p id={emailErrorId} className="text-sm text-destructive">
            {errors.email}
          </p>
        ) : null}
      </div>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={errors.types ? typesErrorId : undefined}
      >
        <legend className="sr-only">What should we notify you about?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="types" value="RESTOCK" defaultChecked className="size-4" />
          Restock / similar piece
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="types" value="SIMILAR_FABRIC" className="size-4" />
          Similar fabric
        </label>
        {errors.types ? (
          <p id={typesErrorId} className="text-sm text-destructive">
            {errors.types}
          </p>
        ) : null}
      </fieldset>
      {state && !state.ok && state.formError ? (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Notify me"}
      </Button>
    </form>
  );
}
