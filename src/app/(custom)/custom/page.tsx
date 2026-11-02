import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Custom tailoring" };

export default function CustomTailoringPage() {
  return (
    <PlaceholderPage title="Custom tailoring" description="Landing page for the custom journey." />
  );
}
