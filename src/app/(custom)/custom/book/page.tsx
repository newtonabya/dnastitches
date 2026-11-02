import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Book a consultation" };

export default function BookAConsultationPage() {
  return (
    <PlaceholderPage
      title="Book a consultation"
      story="US-F1"
      description="Pick an in-studio or video consultation slot."
      release="v1.1"
    />
  );
}
