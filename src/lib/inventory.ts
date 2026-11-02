import { InventoryStatus } from "@/generated/prisma/enums";

/** Default "Last One" threshold (D-2). */
export const DEFAULT_LOW_STOCK_THRESHOLD = 1;

/**
 * Derive a product's inventory status from its quantity (US-A1, D-2).
 *
 * - `quantity <= 0`            → SOLD_OUT
 * - `quantity <= threshold`    → LOW_STOCK ("Last One")
 * - otherwise                  → AVAILABLE
 *
 * Product writes must use this so `inventoryStatus` never drifts from `quantity`.
 */
export function deriveInventoryStatus(
  quantity: number,
  lowStockThreshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
): InventoryStatus {
  if (!Number.isInteger(quantity)) {
    throw new RangeError(`quantity must be an integer, got ${quantity}`);
  }
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new RangeError(
      `lowStockThreshold must be a non-negative integer, got ${lowStockThreshold}`,
    );
  }
  if (quantity <= 0) return InventoryStatus.SOLD_OUT;
  if (quantity <= lowStockThreshold) return InventoryStatus.LOW_STOCK;
  return InventoryStatus.AVAILABLE;
}
