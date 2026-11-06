"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { demoContentAction } from "@/server/actions/admin/demo";
import type { ActionResult } from "@/server/actions/types";

/** Admin → Settings: load or remove the sample catalogue. */
export function DemoContentButtons({
  hasDemo,
  action,
}: {
  hasDemo: boolean;
  action: typeof demoContentAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (
          submitter?.value === "remove" &&
          !window.confirm("Remove all demo products, swatches, portfolio pieces and zones?")
        )
          e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="load" variant="outline" disabled={pending}>
          {hasDemo ? "Load missing demo content" : "Load demo content"}
        </Button>
        {hasDemo ? (
          <Button
            type="submit"
            name="intent"
            value="remove"
            variant="destructive"
            disabled={pending}
          >
            Remove demo content
          </Button>
        ) : null}
      </div>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Working…
        </p>
      ) : (
        <FormMessage state={state} />
      )}
    </form>
  );
}
