import type { CustomOrderStatus, FulfillmentMethod } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/custom-order/status";
import type { EmailMessage } from "@/lib/email";
import { formatNGN } from "@/lib/money";

/** Statuses that email the customer (US-C1 AC6). */
export const CUSTOMER_EMAIL_STATUSES: readonly CustomOrderStatus[] = [
  "MEASUREMENTS_TAKEN",
  "AWAITING_DEPOSIT",
  "IN_PRODUCTION",
  "FITTING",
  "READY",
];

export interface StatusEmailData {
  status: CustomOrderStatus;
  orderId: string;
  reference: string;
  title: string;
  customerName: string | null;
  customerEmail: string;
  siteUrl: string;
  quotedPriceKobo: number | null;
  depositKobo: number | null;
  deliveryFeeKobo: number | null;
  balanceDueKobo: number;
  fulfillmentMethod: FulfillmentMethod | null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function body(d: StatusEmailData): string[] | null {
  const link = `${d.siteUrl}/account/wardrobe/${d.orderId}`;
  switch (d.status) {
    case "MEASUREMENTS_TAKEN":
      return [
        "Your measurements are on file. We're now preparing your quote.",
        `Follow along: ${link}`,
      ];
    case "AWAITING_DEPOSIT":
      return [
        `Your quote is ready: ${formatNGN(d.quotedPriceKobo ?? 0)}` +
          (d.deliveryFeeKobo ? ` plus ${formatNGN(d.deliveryFeeKobo)} delivery` : "") +
          ".",
        `A deposit of ${formatNGN(d.depositKobo ?? 0)} is needed before we start production. The deposit is non-refundable and all sales are final.`,
        `Review and pay: ${link}`,
      ];
    case "IN_PRODUCTION":
      return ["Your deposit is in and your piece is now in production.", `Follow along: ${link}`];
    case "FITTING":
      return [
        "Your piece is ready for a fitting. We'll be in touch to arrange a time.",
        `Details: ${link}`,
      ];
    case "READY":
      return [
        d.fulfillmentMethod === "DELIVERY"
          ? "Your piece is finished and will be sent out for delivery."
          : "Your piece is finished and ready for pickup at the studio.",
        d.balanceDueKobo > 0
          ? `Balance due before handover: ${formatNGN(d.balanceDueKobo)}.`
          : "Your order is fully paid.",
        `Details: ${link}`,
      ];
    default:
      return null;
  }
}

/** The customer email for a status change, or null if this status sends none. */
export function statusChangeEmail(d: StatusEmailData): EmailMessage | null {
  const lines = body(d);
  if (!lines) return null;
  const all = [
    `Hi ${d.customerName ?? "there"},`,
    `Update on "${d.title}" (${d.reference}):`,
    ...lines,
    "— DNA Stitches",
  ];
  return {
    to: d.customerEmail,
    subject: `${d.reference}: ${STATUS_LABELS[d.status]}`,
    text: all.join("\n\n"),
    html: all.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n"),
  };
}
