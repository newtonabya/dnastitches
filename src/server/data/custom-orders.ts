import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { targetDateToUtc } from "@/lib/custom-order/lead-time";
import { formatReference, nextSequence } from "@/lib/custom-order/reference";
import { isBlobUrl } from "@/lib/uploads";
import type { CustomOrderRequest } from "@/lib/validators/custom-order";
import { resolveCustomRequestPrefill } from "@/server/custom/prefill";

import { createProfileInTx } from "./measurements";

type Db = PrismaClient;

export type CreateCustomOrderResult =
  { ok: true; id: string; reference: string } | { ok: false; fieldErrors: Record<string, string> };

export const APPOINTMENT_NOTE =
  "Customer asked to book a measurement appointment instead of entering measurements.";

const MAX_REFERENCE_ATTEMPTS = 5;

class RequestError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("Invalid custom request");
  }
}

function isReferenceCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("reference")
  );
}

/**
 * Create a custom order from a validated request (US-B1 AC5–6, US-A3 AC4, US-B2 AC4).
 * Runs in one transaction: optional new measurement profile, the order with a
 * human-readable reference, and the first status-log entry. The reference is
 * collision-safe: a unique constraint plus retry.
 */
export async function createCustomOrderRequest(
  db: Db,
  userId: string,
  request: CustomOrderRequest,
  { now = new Date() }: { now?: Date } = {},
): Promise<CreateCustomOrderResult> {
  // Reference images must be our own uploads or images of the piece the request came from.
  const prefill = await resolveCustomRequestPrefill(db, {
    fromProduct: request.source.fromProductId,
    fromPortfolio: request.source.fromPortfolioId,
  });
  const badImage = request.design.referenceImageUrls.findIndex(
    (url) => !isBlobUrl(url) && !prefill.referenceImageUrls.includes(url),
  );
  if (badImage !== -1) {
    return {
      ok: false,
      fieldErrors: {
        [`design.referenceImageUrls.${badImage}`]:
          "This image can't be used. Please upload it again.",
      },
    };
  }

  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric" }).format(now),
  );

  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        if (request.fabric.fabricSwatchId) {
          const swatch = await tx.fabricSwatch.findFirst({
            where: { id: request.fabric.fabricSwatchId, isAvailable: true },
            select: { id: true },
          });
          if (!swatch)
            throw new RequestError({
              "fabric.fabricSwatchId": "That fabric is no longer available. Please choose another.",
            });
        }

        let measurementProfileId: string | null = null;
        if (request.measurements.mode === "existing") {
          const profile = await tx.measurementProfile.findFirst({
            where: { id: request.measurements.profileId, userId, supersededAt: null },
            select: { id: true },
          });
          if (!profile)
            throw new RequestError({
              "measurements.profileId": "Choose one of your saved profiles.",
            });
          measurementProfileId = profile.id;
        } else if (request.measurements.mode === "new") {
          measurementProfileId = (await createProfileInTx(tx, userId, request.measurements.profile))
            .id;
        }

        let addressId: string | null = null;
        if (request.fulfilment.fulfillmentMethod === "DELIVERY") {
          const address = await tx.address.findFirst({
            where: { id: request.fulfilment.addressId, userId },
            select: { id: true },
          });
          if (!address)
            throw new RequestError({
              "fulfilment.addressId": "Choose one of your saved addresses.",
            });
          addressId = address.id;
        }

        const existing = await tx.customOrder.findMany({
          where: { reference: { startsWith: `DNA-${year}-` } },
          select: { reference: true },
        });
        const reference = formatReference(
          year,
          nextSequence(
            year,
            existing.map((o) => o.reference),
          ) +
            attempt -
            1,
        );

        const order = await tx.customOrder.create({
          data: {
            reference,
            userId,
            status: "REQUEST_RECEIVED",
            title: request.design.title,
            description: request.design.description,
            occasion: request.design.occasion ?? null,
            targetDate: request.design.targetDate
              ? targetDateToUtc(request.design.targetDate)
              : null,
            budgetKobo: request.design.budgetKobo ?? null,
            referenceImageUrls: request.design.referenceImageUrls,
            sourceProductId: prefill.fromProductId ?? null,
            portfolioItemId: prefill.fromPortfolioId ?? null,
            fabricSwatchId: request.fabric.fabricSwatchId,
            measurementProfileId,
            fulfillmentMethod: request.fulfilment.fulfillmentMethod,
            addressId,
            adminNotes: request.measurements.mode === "appointment" ? APPOINTMENT_NOTE : null,
            statusLogs: {
              create: {
                fromStatus: null,
                toStatus: "REQUEST_RECEIVED",
                changedById: userId,
                note: "Request submitted",
              },
            },
          },
          select: { id: true, reference: true },
        });
        return { ok: true, id: order.id, reference: order.reference } as const;
      });
    } catch (error) {
      if (error instanceof RequestError) return { ok: false, fieldErrors: error.fieldErrors };
      if (isReferenceCollision(error) && attempt < MAX_REFERENCE_ATTEMPTS) continue;
      throw error;
    }
  }
}

/** The signed-in customer's own order by reference (success page); null if not theirs. */
export async function getOwnCustomOrderByReference(
  db: Pick<PrismaClient, "customOrder">,
  userId: string,
  reference: string,
) {
  return db.customOrder.findFirst({
    where: { reference, userId },
    select: { id: true, reference: true, title: true, status: true, createdAt: true },
  });
}
