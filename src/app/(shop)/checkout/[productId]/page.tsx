import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <PlaceholderPage
      title="Checkout"
      story="US-A4"
      description="Pickup or delivery, final-sale acknowledgement and Paystack payment."
    />
  );
}
