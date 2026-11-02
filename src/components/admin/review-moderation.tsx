"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import type { moderateReviewAction } from "@/server/actions/admin/reviews";
import type { ActionResult } from "@/server/actions/types";

/** US-H1 AC2: approve (publish) or hide one review. */
export function ReviewModeration({
  reviewId,
  state: current,
  label,
  action,
}: {
  reviewId: string;
  state: "PENDING" | "APPROVED" | "HIDDEN";
  /** Names the review for screen readers. */
  label: string;
  action: typeof moderateReviewAction;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} aria-label={`Moderate ${label}`} className="flex flex-wrap gap-2">
        <input type="hidden" name="reviewId" value={reviewId} />
        <input
          type="hidden"
          name="show"
          value={current === "PENDING" ? "pending" : current === "APPROVED" ? "approved" : "hidden"}
        />
        {current !== "APPROVED" ? (
          <Button type="submit" name="decision" value="APPROVE" size="sm" disabled={pending}>
            Approve
          </Button>
        ) : null}
        {current !== "HIDDEN" ? (
          <Button
            type="submit"
            name="decision"
            value="HIDE"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Hide
          </Button>
        ) : null}
      </form>
      <FormMessage state={state} />
    </div>
  );
}
