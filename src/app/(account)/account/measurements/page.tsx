import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "My measurements" };

export default function MyMeasurementsPage() {
  return (
    <PlaceholderPage
      title="My measurements"
      story="US-B3"
      description="Saved measurement profiles."
    />
  );
}
