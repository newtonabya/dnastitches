import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  SHOP_STATUS_FILTERS,
  SHOP_STATUS_FILTER_LABELS,
  type ShopStatusFilter,
  shopHref,
} from "@/lib/shop";

/** Status filter links (US-A1 AC6). Query-string based, so the filter survives a refresh. */
export function ShopFilterNav({ current }: { current: ShopStatusFilter }) {
  return (
    <nav aria-label="Filter by availability">
      <ul className="flex flex-wrap gap-2">
        {SHOP_STATUS_FILTERS.map((status) => {
          const active = status === current;
          return (
            <li key={status}>
              <Link
                href={shopHref({ status })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {SHOP_STATUS_FILTER_LABELS[status]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
