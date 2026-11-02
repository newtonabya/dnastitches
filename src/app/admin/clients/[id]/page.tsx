import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Client profile" };

export default function ClientProfilePage() {
  return (
    <PlaceholderPage
      title="Client profile"
      story="US-C2"
      description="Measurements history, orders, payments and repairs."
    />
  );
}
