"use client";

import { useSyncExternalStore } from "react";

import type { MeasurementUnit } from "@/generated/prisma/enums";
import { formatMeasurement } from "@/lib/units";
import { cn } from "@/lib/utils";

/** sessionStorage key: the cm/in choice persists for the browser session (US-A2 AC2). */
export const SPEC_UNIT_STORAGE_KEY = "dna:spec-unit";
const CHANGE_EVENT = "dna:spec-unit-change";

function readUnit(): MeasurementUnit {
  try {
    return window.sessionStorage.getItem(SPEC_UNIT_STORAGE_KEY) === "IN" ? "IN" : "CM";
  } catch {
    return "CM";
  }
}

function writeUnit(unit: MeasurementUnit) {
  try {
    window.sessionStorage.setItem(SPEC_UNIT_STORAGE_KEY, unit);
  } catch {
    // Storage unavailable (private mode): the toggle still works for this render via the event.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: unit }));
}

let fallbackUnit: MeasurementUnit | null = null;

function subscribe(onChange: () => void) {
  const handler = (e: Event) => {
    if (e instanceof CustomEvent) fallbackUnit = e.detail as MeasurementUnit;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function useSpecUnit(): [MeasurementUnit, (u: MeasurementUnit) => void] {
  const unit = useSyncExternalStore(
    subscribe,
    () => {
      const stored = readUnit();
      return stored === "CM" && fallbackUnit ? fallbackUnit : stored;
    },
    () => "CM" as const,
  );
  return [unit, writeUnit];
}

export interface SpecMeasurements {
  bust: number | null;
  waist: number | null;
  hips: number | null;
  length: number | null;
}

const ROWS: { key: keyof SpecMeasurements; label: string }[] = [
  { key: "bust", label: "Bust" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "length", label: "Length" },
];

const UNITS: { value: MeasurementUnit; label: string }[] = [
  { value: "CM", label: "cm" },
  { value: "IN", label: "in" },
];

/** Garment measurements with a cm/in toggle (US-A2 AC1–2). Values are stored in cm. */
export function SpecTable({
  measurements,
  sizeLabel,
}: {
  measurements: SpecMeasurements;
  sizeLabel?: string | null;
}) {
  const [unit, setUnit] = useSpecUnit();

  return (
    <section aria-labelledby="spec-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="spec-heading" className="text-lg font-semibold">
          Garment measurements
        </h2>
        <div
          role="group"
          aria-label="Measurement unit"
          className="inline-flex rounded-md border p-0.5"
        >
          {UNITS.map((u) => (
            <button
              key={u.value}
              type="button"
              aria-pressed={unit === u.value}
              onClick={() => setUnit(u.value)}
              className={cn(
                "rounded px-3 py-1 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                unit === u.value ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">
          Garment measurements in {unit === "CM" ? "centimetres" : "inches"}
        </caption>
        <tbody className="divide-y">
          {sizeLabel ? (
            <tr>
              <th scope="row" className="py-2 text-left font-medium">
                Size
              </th>
              <td className="py-2 text-right">{sizeLabel}</td>
            </tr>
          ) : null}
          {ROWS.map(({ key, label }) => {
            const value = measurements[key];
            return (
              <tr key={key}>
                <th scope="row" className="py-2 text-left font-medium">
                  {label}
                </th>
                <td className="py-2 text-right tabular-nums" data-testid={`spec-${key}`}>
                  {value === null ? "—" : formatMeasurement(value, "CM", unit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
