import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Appointments" };

export default function AppointmentsPage() {
  return (
    <PlaceholderPage
      title="Appointments"
      story="US-F2"
      description="Calendar and list of appointments."
      release="v1.1"
    />
  );
}
