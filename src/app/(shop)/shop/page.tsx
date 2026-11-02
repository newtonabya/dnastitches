import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Shop" };

export default function ShopPage() {
  return (
    <PlaceholderPage
      title="Shop"
      story="US-A1"
      description="Gallery of 1-of-1 ready-to-wear pieces with availability cues."
    />
  );
}
