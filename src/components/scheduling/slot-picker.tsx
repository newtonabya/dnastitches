"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export interface SlotOption {
  startsAt: string; // ISO
  localDate: string; // studio-local YYYY-MM-DD
}

const pill =
  "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50";

/**
 * US-F1 AC1: choose a day, then a time. Both are native radio groups, so arrow keys,
 * Tab and screen readers work without extra code. Times are in the studio's zone.
 */
export function SlotPicker({
  slots,
  timeZone,
  error,
  initialDate,
}: {
  slots: SlotOption[];
  timeZone: string;
  error?: string;
  initialDate?: string;
}) {
  const id = useId();
  const days = [...new Set(slots.map((s) => s.localDate))];
  const [day, setDay] = useState(initialDate && days.includes(initialDate) ? initialDate : days[0]);
  const [chosen, setChosen] = useState<string>("");
  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${d}T12:00:00Z`));
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
  const city = timeZone.split("/").pop()!.replace(/_/g, " ");

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Day</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {days.map((d) => (
            <label key={d} className={pill}>
              <input
                type="radio"
                name={`${id}-day`}
                value={d}
                checked={day === d}
                onChange={() => {
                  setDay(d);
                  setChosen("");
                }}
                className="sr-only"
              />
              {dayLabel(d)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <legend className="mb-1 text-sm font-medium">
          Time <span className="font-normal text-muted-foreground">({city} time)</span>
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {slots
            .filter((s) => s.localDate === day)
            .map((s) => (
              <label key={s.startsAt} className={pill}>
                <input
                  type="radio"
                  name="startsAt"
                  value={s.startsAt}
                  checked={chosen === s.startsAt}
                  onChange={() => setChosen(s.startsAt)}
                  className="sr-only"
                />
                {timeLabel(s.startsAt)}
              </label>
            ))}
        </div>
        {error ? (
          <p id={`${id}-error`} className={cn("text-sm text-destructive")}>
            {error}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
