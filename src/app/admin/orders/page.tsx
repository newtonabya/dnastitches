import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Custom order pipeline" };

export default function CustomOrderPipelinePage() {
  return (
    <PlaceholderPage
      title="Custom order pipeline"
      story="US-C1"
      description="Kanban board of custom orders."
    />
  );
}
