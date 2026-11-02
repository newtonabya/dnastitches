"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import type { MeasurementUnit } from "@/generated/prisma/enums";
import { MEASUREMENT_FIELDS, plausibleRange } from "@/lib/validators/measurements";

export interface MeasurementDefaults {
  label?: string;
  unit?: MeasurementUnit;
  bust?: number | null;
  waist?: number | null;
  hips?: number | null;
  shoulder?: number | null;
  armLength?: number | null;
  inseam?: number | null;
  height?: number | null;
  notes?: string | null;
}

/**
 * Measurement inputs with a "How to measure" helper per field (US-B3 AC4).
 * Uncontrolled and named, so it works inside any <form>. Errors are keyed by field
 * name (optionally prefixed, e.g. "profile.waist").
 */
export function MeasurementFields({
  defaults = {},
  errors = {},
  errorPrefix = "",
}: {
  defaults?: MeasurementDefaults;
  errors?: Record<string, string>;
  errorPrefix?: string;
}) {
  const id = useId();
  const [unit, setUnit] = useState<MeasurementUnit>(defaults.unit ?? "CM");
  const err = (key: string) => errors[`${errorPrefix}${key}`];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-label`} className="text-sm font-medium">
          Label
        </label>
        <Input
          id={`${id}-label`}
          name="label"
          defaultValue={defaults.label ?? ""}
          placeholder='e.g. "Wedding 2026"'
          required
          aria-invalid={err("label") ? true : undefined}
          aria-describedby={err("label") ? `${id}-label-error` : undefined}
        />
        {err("label") ? (
          <p id={`${id}-label-error`} className="text-sm text-destructive">
            {err("label")}
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Unit</legend>
        <div className="flex gap-4">
          {(["CM", "IN"] as const).map((u) => (
            <label key={u} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="unit"
                value={u}
                checked={unit === u}
                onChange={() => setUnit(u)}
                className="size-4"
              />
              {u === "CM" ? "Centimetres (cm)" : "Inches (in)"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {MEASUREMENT_FIELDS.map((field) => {
          const inputId = `${id}-${field.key}`;
          const error = err(field.key);
          const range = plausibleRange(field.key, unit);
          const value = defaults[field.key];
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-sm font-medium">
                {field.label} ({unit === "CM" ? "cm" : "in"}){field.required ? "" : " — optional"}
              </label>
              <Input
                id={inputId}
                name={field.key}
                type="number"
                inputMode="decimal"
                step="0.1"
                min={range.min}
                max={range.max}
                defaultValue={value ?? ""}
                required={field.required}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ""}`}
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer underline-offset-2 hover:underline">
                  How to measure
                </summary>
                <p id={`${inputId}-help`} className="mt-1">
                  {field.howTo}
                </p>
              </details>
              {error ? (
                <p id={`${inputId}-error`} className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-notes`} className="text-sm font-medium">
          Notes — optional
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          defaultValue={defaults.notes ?? ""}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}
