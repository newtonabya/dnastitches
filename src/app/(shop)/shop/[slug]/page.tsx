import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Product details" };

export default function ProductDetailsPage() {
  return (
    <PlaceholderPage
      title="Product details"
      story="US-A2, US-A3, US-A4, US-D2"
      description="Measurements, care, and buy / request-custom actions."
    />
  );
}
