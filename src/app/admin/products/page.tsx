import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <PlaceholderPage title="Products" story="US-C3" description="Manage ready-to-wear pieces." />
  );
}
