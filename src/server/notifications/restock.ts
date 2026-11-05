import "server-only";

import { after } from "next/server";

import { restockEmail } from "@/emails/restock";
import { getEmailSender } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  type ClaimedRestock,
  getRestockEmailProduct,
  releaseRestockClaim,
} from "@/server/data/restock";

/**
 * After the response, email each claimed restock request. A failed email is released
 * so it's retried the next time the product is saved; failures are logged without the
 * address (NFR-3).
 */
export function sendRestockEmails(productId: string, claimed: ClaimedRestock[]) {
  if (claimed.length === 0) return;
  after(async () => {
    const product = await getRestockEmailProduct(prisma, productId);
    if (!product) return;
    const sender = getEmailSender();
    for (const request of claimed) {
      try {
        await sender.send(
          restockEmail({
            productName: product.name,
            slug: product.slug,
            priceKobo: product.priceKobo,
            to: request.email,
            siteUrl: env.NEXT_PUBLIC_SITE_URL,
          }),
        );
      } catch (error) {
        console.error(
          "[restock] Email failed; will retry on the next save:",
          error instanceof Error ? error.message : error,
        );
        await releaseRestockClaim(prisma, request.id);
      }
    }
  });
}
