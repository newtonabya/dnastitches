import "server-only";

import { after } from "next/server";

import { ownerPaymentEmail, rtwOrderConfirmationEmail } from "@/emails/payments";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatNGN } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { FinalizeResult } from "@/server/data/checkout";
import { notifyCustomerOfStatus } from "@/server/notifications/order-status";

/** After the response: email the customer and/or owner about a finalised payment. */
export function notifyPaymentOutcome(result: FinalizeResult, reference: string) {
  const owners = env.ADMIN_EMAILS;
  const site = env.NEXT_PUBLIC_SITE_URL;

  if (result.outcome === "DEPOSIT_PAID" && result.customOrderId) {
    // Customer gets the "In production" status email (US-C1 AC6 / US-C4 AC3).
    notifyCustomerOfStatus(result.customOrderId);
  }

  after(async () => {
    switch (result.outcome) {
      case "RTW_PAID": {
        if (!result.orderId) return;
        const order = await prisma.order.findUnique({
          where: { id: result.orderId },
          include: { user: true, product: true, address: true, deliveryZone: true },
        });
        if (!order) return;
        await sendEmail(
          rtwOrderConfirmationEmail({
            customerName: order.user.name,
            customerEmail: order.user.email,
            productName: order.product.name,
            totalKobo: order.totalKobo,
            fulfillmentMethod: order.fulfillmentMethod,
            address: order.address
              ? `${order.address.recipientName}, ${order.address.line1}, ${order.address.city}, ${order.address.state}`
              : null,
            etaDays: order.deliveryZone?.etaDays ?? null,
            studioAddress: env.STUDIO_ADDRESS ?? null,
            studioHours: env.STUDIO_HOURS ?? null,
            siteUrl: site,
          }),
        );
        if (owners.length)
          await sendEmail(
            ownerPaymentEmail(owners, `Sold: ${order.product.name}`, [
              `${order.product.name} was paid for (${formatNGN(order.totalKobo)}) by ${order.user.email}.`,
              `Fulfilment: ${order.fulfillmentMethod.toLowerCase()}.`,
              `Shop orders: ${site}/admin/orders?view=shop`,
            ]),
          );
        return;
      }
      case "DEPOSIT_PAID":
      case "CUSTOM_PAID": {
        if (!result.customOrderId || !owners.length) return;
        const order = await prisma.customOrder.findUnique({
          where: { id: result.customOrderId },
          select: { reference: true, title: true },
        });
        if (!order) return;
        await sendEmail(
          ownerPaymentEmail(
            owners,
            `${result.outcome === "DEPOSIT_PAID" ? "Deposit" : "Payment"} received: ${order.reference}`,
            [
              `An online ${result.kind === "CUSTOM_DEPOSIT" ? "deposit" : "balance"} payment was received for ${order.reference} (${order.title}).`,
              `Order: ${site}/admin/orders/${result.customOrderId}`,
            ],
          ),
        );
        return;
      }
      case "RTW_PAID_UNAVAILABLE":
      case "AMOUNT_MISMATCH": {
        if (!owners.length) return;
        await sendEmail(
          ownerPaymentEmail(owners, "Payment needs attention", [
            result.outcome === "RTW_PAID_UNAVAILABLE"
              ? "A customer paid after their 15-minute hold expired and the piece had already been sold to someone else."
              : "A payment's amount or currency didn't match what we expected, so it wasn't applied.",
            `Paystack reference: ${reference}. Please review it in the Paystack dashboard and contact the customer.`,
          ]),
        );
        return;
      }
      default:
        return;
    }
  });
}
