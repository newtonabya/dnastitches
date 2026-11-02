import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return (
    <PlaceholderPage
      title="Reviews"
      story="US-H1"
      description="Approve customer reviews."
      release="v1.1"
    />
  );
}
