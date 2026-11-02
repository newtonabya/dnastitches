import { useId } from "react";

import { Input } from "@/components/ui/input";

/** Labelled text input with an inline, programmatically linked error message. */
export function Field({
  label,
  name,
  error,
  hint,
  ...inputProps
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
} & Omit<React.ComponentProps<"input">, "name" | "id">) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({
  state,
}: {
  state: { ok: boolean; message?: string; formError?: string } | null;
}) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {state.message}
      </p>
    ) : null;
  }
  return state.formError ? (
    <p role="alert" className="text-sm text-destructive">
      {state.formError}
    </p>
  ) : null;
}
