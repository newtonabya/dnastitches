import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Request received" };

export default function RequestReceivedPage() {
  return (
    <PlaceholderPage
      title="Request received"
      story="US-B1"
      description="Confirmation screen with your order reference."
    />
  );
}
