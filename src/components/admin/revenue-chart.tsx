import { compactNaira, monthLabel, niceCeiling } from "@/lib/analytics";
import { formatNGN } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Monthly revenue as a single-series column chart (v1.2, US-C5). Plain HTML and CSS:
 * each month is a focusable list item whose tooltip shows on hover or keyboard focus,
 * and the same numbers are always available as a table below.
 */
export function RevenueChart({ data }: { data: { month: string; amountKobo: number }[] }) {
  const max = niceCeiling(Math.max(...data.map((d) => d.amountKobo), 0));
  const ticks = [max, max / 2, 0];

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex gap-2">
        {/* Recessive y-axis: three labels lined up with the gridlines. */}
        <div
          aria-hidden="true"
          className="flex h-40 flex-col justify-between text-right text-[11px] leading-none text-muted-foreground tabular-nums"
        >
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compactNaira(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-40">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          </div>
          <ol aria-label="Revenue by month" className="relative flex h-40 items-end">
            {data.map((d, i) => {
              const height = max > 0 ? (d.amountKobo / max) * 100 : 0;
              const label = `${monthLabel(d.month)}: ${formatNGN(d.amountKobo)}`;
              return (
                <li
                  key={d.month}
                  tabIndex={0}
                  className="group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="sr-only">{label}</span>
                  <span
                    aria-hidden="true"
                    className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                    style={{ height: `${height}%`, minHeight: d.amountKobo > 0 ? 2 : 0 }}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm group-hover:block group-focus-visible:block",
                      // Kept inside the chart at both ends.
                      i < 2
                        ? "left-0"
                        : i >= data.length - 2
                          ? "right-0"
                          : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    <span className="font-medium">{monthLabel(d.month)}</span>{" "}
                    <span className="tabular-nums">{formatNGN(d.amountKobo)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div aria-hidden="true" className="mt-1 flex text-[11px] text-muted-foreground">
            {data.map((d, i) => (
              <span key={d.month} className="flex-1 text-center">
                {/* Every other month on narrow screens (always the current one), so labels never collide. */}
                <span className={(data.length - 1 - i) % 2 ? "hidden sm:inline" : undefined}>
                  {monthLabel(d.month, false)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Payments received each month, shop and custom together, in Lagos time.
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Show as a table
        </summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <caption className="sr-only">Revenue by month</caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="py-1 font-medium">
                Month
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-b last:border-0">
                <th scope="row" className="py-1 font-normal">
                  {monthLabel(d.month)}
                </th>
                <td className="py-1 text-right tabular-nums">{formatNGN(d.amountKobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
