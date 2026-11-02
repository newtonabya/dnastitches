import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Repair requests" };

export default function RepairRequestsPage() {
  return (
    <PlaceholderPage
      title="Repair requests"
      story="US-D3"
      description="Defect reports within the repair window."
    />
  );
}
