import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { DeliveryZoneInput } from "@/lib/validators/catalog";

/** Delivery zones (D-12): flat fee per zone of states, managed in /admin/settings. */

type Db = Pick<PrismaClient, "deliveryZone">;

export async function listDeliveryZones(db: Db) {
  return db.deliveryZone.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
}

/** States covered by more than one active zone; the first zone wins, so these deserve a warning. */
export function overlappingStates(
  zones: { name: string; states: string[]; isActive: boolean }[],
): Map<string, string[]> {
  const byState = new Map<string, string[]>();
  for (const z of zones.filter((z) => z.isActive)) {
    for (const s of z.states) byState.set(s, [...(byState.get(s) ?? []), z.name]);
  }
  return new Map([...byState].filter(([, names]) => names.length > 1));
}

function zoneData(input: DeliveryZoneInput) {
  return {
    name: input.name,
    states: input.states,
    feeKobo: input.feeNaira,
    etaDays: input.etaDays,
    isActive: input.isActive,
  };
}

export async function createDeliveryZone(db: Db, input: DeliveryZoneInput) {
  return db.deliveryZone.create({ data: zoneData(input), select: { id: true } });
}

export async function updateDeliveryZone(
  db: Db,
  id: string,
  input: DeliveryZoneInput,
): Promise<boolean> {
  const result = await db.deliveryZone.updateMany({ where: { id }, data: zoneData(input) });
  return result.count === 1;
}
