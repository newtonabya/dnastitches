import { CustomOrderStatus } from "@/generated/prisma/enums";
import {
  CUSTOMER_EMAIL_STATUSES,
  type StatusEmailData,
  statusChangeEmail,
} from "@/emails/order-status";

const base: StatusEmailData = {
  status: "AWAITING_DEPOSIT",
  orderId: "o1",
  reference: "DNA-2026-0007",
  title: "Green <gown>",
  customerName: "Ada",
  customerEmail: "ada@example.com",
  siteUrl: "https://dna.example",
  quotedPriceKobo: 250_000_00,
  depositKobo: 125_000_00,
  deliveryFeeKobo: 5_000_00,
  balanceDueKobo: 255_000_00,
  fulfillmentMethod: "DELIVERY",
};

describe("statusChangeEmail (US-C1 AC6)", () => {
  it("emails exactly the PRD statuses", () => {
    for (const status of Object.values(CustomOrderStatus)) {
      const email = statusChangeEmail({ ...base, status });
      expect(email !== null).toBe(CUSTOMER_EMAIL_STATUSES.includes(status));
    }
  });

  it("AWAITING_DEPOSIT includes the quote, deposit, non-refundable notice and pay link", () => {
    const email = statusChangeEmail(base)!;
    expect(email.to).toBe("ada@example.com");
    expect(email.subject).toBe("DNA-2026-0007: Awaiting deposit");
    expect(email.text).toContain("₦250,000.00 plus ₦5,000.00 delivery");
    expect(email.text).toContain("deposit of ₦125,000.00");
    expect(email.text).toContain("non-refundable");
    expect(email.text).toContain("https://dna.example/account/wardrobe/o1");
  });

  it("READY includes the balance and pickup/delivery wording", () => {
    expect(statusChangeEmail({ ...base, status: "READY" })!.text).toMatch(
      /delivery[\s\S]*Balance due before handover: ₦255,000.00/,
    );
    const pickup = statusChangeEmail({
      ...base,
      status: "READY",
      fulfillmentMethod: "PICKUP",
      balanceDueKobo: 0,
    })!;
    expect(pickup.text).toContain("ready for pickup");
    expect(pickup.text).toContain("fully paid");
  });

  it("escapes HTML", () => {
    expect(statusChangeEmail(base)!.html).toContain("Green &lt;gown&gt;");
  });
});
