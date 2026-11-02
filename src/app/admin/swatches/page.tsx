import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Fabric swatches" };

export default function FabricSwatchesPage() {
  return (
    <PlaceholderPage title="Fabric swatches" story="US-C3" description="Manage fabric swatches." />
  );
}
