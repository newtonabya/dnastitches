"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** The viewer's own time zone, or null during server rendering. */
function useViewerTimeZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

const cityOf = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

function format(date: Date, timeZone: string, withDate: boolean) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function sameWallTime(date: Date, a: string, b: string) {
  return format(date, a, true) === format(date, b, true);
}

/**
 * A time shown in the studio's zone ("Tue 10 Nov, 10:00 Lagos time"), plus the viewer's
 * own local time when it differs (US-F1 DoD). Server and first client render match;
 * the viewer's time is added after hydration.
 */
export function LocalTime({
  iso,
  endIso,
  timeZone,
  withDate = true,
}: {
  iso: string;
  endIso?: string;
  timeZone: string;
  withDate?: boolean;
}) {
  const viewer = useViewerTimeZone();
  const start = new Date(iso);
  const end = endIso ? new Date(endIso) : null;
  const range = (tz: string) =>
    `${format(start, tz, withDate)}${end ? `–${format(end, tz, false)}` : ""}`;
  return (
    <span>
      <time dateTime={iso}>{range(timeZone)}</time>{" "}
      <span className="text-muted-foreground">{cityOf(timeZone)} time</span>
      {viewer && !sameWallTime(start, viewer, timeZone) ? (
        <span className="text-muted-foreground"> · {range(viewer)} your time</span>
      ) : null}
    </span>
  );
}
