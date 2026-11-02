import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return <PlaceholderPage title="Portfolio" story="US-C3" description="Manage portfolio items." />;
}
