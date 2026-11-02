import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Terms of sale" };

export default function TermsOfSalePage() {
  return (
    <PlaceholderPage
      title="Terms of sale"
      story="D-11, D-13"
      description="All sales are final; non-refundable deposits; free defect repair within 7 days."
    />
  );
}
