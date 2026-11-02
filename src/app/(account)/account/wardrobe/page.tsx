import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "My Wardrobe" };

export default function MyWardrobePage() {
  return (
    <PlaceholderPage
      title="My Wardrobe"
      story="US-D1"
      description="Your custom orders and purchases."
    />
  );
}
