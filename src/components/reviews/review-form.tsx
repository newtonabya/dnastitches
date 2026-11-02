"use client";

import { useId, useState } from "react";

import { Field, FormMessage } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";
import { MAX_RATING } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import type { createReviewAction } from "@/server/actions/reviews";

const STARS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/** US-H1 AC1: star rating (a native radio group), review text and public name. */
export function ReviewForm({
  kind,
  targetId,
  defaultName,
  action,
}: {
  kind: "ORDER" | "CUSTOM_ORDER";
  targetId: string;
  defaultName: string;
  action: typeof createReviewAction;
}) {
  const id = useId();
  const { state, pending, formRef, onSubmit, fieldErrors } = useFormAction(action);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-label="Leave a review"
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetId" value={targetId} />
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={fieldErrors.rating ? `${id}-rating-error` : undefined}
      >
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {STARS.map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="cursor-pointer rounded text-3xl leading-none has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <span aria-hidden className={cn(n <= shown ? "text-brand" : "text-muted-foreground")}>
                {n <= shown ? "★" : "☆"}
              </span>
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.rating ? (
          <p id={`${id}-rating-error`} className="text-sm text-destructive">
            {fieldErrors.rating}
          </p>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-sm font-medium">
          Your review
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={5}
          maxLength={1500}
          aria-invalid={fieldErrors.body ? true : undefined}
          aria-describedby={fieldErrors.body ? `${id}-body-error` : undefined}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        {fieldErrors.body ? (
          <p id={`${id}-body-error`} className="text-sm text-destructive">
            {fieldErrors.body}
          </p>
        ) : null}
      </div>
      <Field
        label="Name to show with your review"
        name="displayName"
        defaultValue={defaultName}
        maxLength={60}
        hint="We never show your email address."
        error={fieldErrors.displayName}
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Submit review"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Reviews appear on the site once we&apos;ve checked them.
      </p>
    </form>
  );
}
