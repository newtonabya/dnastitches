import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Custom order" };

export default function CustomOrderPage() {
  return (
    <PlaceholderPage
      title="Custom order"
      story="US-C1, US-C4"
      description="Order detail, status timeline, quote and payments."
    />
  );
}
