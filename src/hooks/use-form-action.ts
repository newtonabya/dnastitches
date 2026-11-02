"use client";

import { type FormEvent, startTransition, useActionState, useEffect, useRef } from "react";

import type { ActionResult } from "@/server/actions/types";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * `useActionState` for forms, without React 19's automatic form reset.
 *
 * React resets uncontrolled fields after every `<form action>` submission, which
 * would wipe the user's input when the server returns validation errors. This
 * submits via `onSubmit` instead, so input is kept on error; pass
 * `resetOnSuccess` to clear the form after a successful submit.
 */
export function useFormAction(action: FormAction, { resetOnSuccess = false } = {}) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return { state, pending, formRef, onSubmit, fieldErrors };
}
