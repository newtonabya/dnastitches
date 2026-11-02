"use client";

import Image from "next/image";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { SwatchOption } from "@/server/data/portfolio";

export const ADVISE_ME_LABEL = "Not sure — advise me";

interface Option {
  id: string | null;
  name: string;
  colorHex?: string;
  imageUrl?: string;
  composition?: string;
}

/**
 * Fabric picker (US-B1 step 2). A single-select radio group: arrow keys (and Home/End)
 * move focus between swatches, Enter or Space selects, and the choice is announced
 * through a polite live region.
 */
export function SwatchGrid({
  swatches,
  value,
  onChange,
  error,
}: {
  swatches: SwatchOption[];
  /** `undefined` = nothing chosen yet; `null` = "advise me". */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  error?: string;
}) {
  const id = useId();
  const options: Option[] = [...swatches, { id: null, name: ADVISE_ME_LABEL }];
  const selectedIndex = value === undefined ? -1 : options.findIndex((o) => o.id === value);
  const [focusIndex, setFocusIndex] = useState(Math.max(selectedIndex, 0));
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function move(index: number) {
    const next = (index + options.length) % options.length;
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onChange(options[index]!.id);
        break;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        <span id={`${id}-label`} className="sr-only">
          Fabric
        </span>
        {options.map((option, index) => {
          const checked = index === selectedIndex;
          return (
            <div
              key={option.id ?? "advise"}
              ref={(el) => {
                refs.current[index] = el;
              }}
              role="radio"
              aria-checked={checked}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => {
                setFocusIndex(index);
                onChange(option.id);
              }}
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                checked ? "border-primary ring-2 ring-primary" : "hover:bg-accent",
              )}
            >
              {option.imageUrl ? (
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  <Image src={option.imageUrl} alt="" fill sizes="200px" className="object-cover" />
                </div>
              ) : (
                <div
                  className="flex aspect-square items-center justify-center rounded-md bg-muted text-3xl text-muted-foreground"
                  aria-hidden
                >
                  ?
                </div>
              )}
              <div className="flex items-center gap-2">
                {option.colorHex ? (
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full border"
                    style={{ backgroundColor: option.colorHex }}
                  />
                ) : null}
                <span className="text-sm font-medium">{option.name}</span>
              </div>
              {option.composition ? (
                <span className="text-xs text-muted-foreground">{option.composition}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="sr-only">
        {selected ? `Selected: ${selected.name}` : ""}
      </p>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
