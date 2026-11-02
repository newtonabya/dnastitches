import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return <PlaceholderPage title="Clients" story="US-C2" description="Search customers." />;
}
