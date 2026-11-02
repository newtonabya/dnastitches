import Link from "next/link";

import { Button } from "@/components/ui/button";
import { type ShopStatusFilter, shopHref } from "@/lib/shop";

export function ShopPagination({
  status,
  page,
  pageCount,
}: {
  status: ShopStatusFilter;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={shopHref({ status, page: page - 1 })} rel="prev">
            Previous
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Button asChild variant="outline">
          <Link href={shopHref({ status, page: page + 1 })} rel="next">
            Next
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
