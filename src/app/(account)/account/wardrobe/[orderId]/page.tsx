import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Order progress" };

export default function OrderProgressPage() {
  return (
    <PlaceholderPage
      title="Order progress"
      story="US-D1, US-C4"
      description="Timeline, quote, payments and balance."
    />
  );
}
