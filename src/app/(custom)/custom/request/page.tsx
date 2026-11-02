import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Request a custom piece" };

export default function RequestACustomPiecePage() {
  return (
    <PlaceholderPage
      title="Request a custom piece"
      story="US-B1"
      description="Multi-step design request: design, fabric, measurements, review."
    />
  );
}
