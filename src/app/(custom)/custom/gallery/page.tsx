import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Portfolio gallery" };

export default function PortfolioGalleryPage() {
  return (
    <PlaceholderPage
      title="Portfolio gallery"
      story="US-B2"
      description="“I want something like this” inspiration gallery."
    />
  );
}
