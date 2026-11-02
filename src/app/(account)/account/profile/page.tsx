import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <PlaceholderPage
      title="Profile"
      story="US-E1"
      description="Name, phone and delivery addresses."
    />
  );
}
