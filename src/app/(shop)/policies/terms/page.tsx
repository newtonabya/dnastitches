import type { Metadata } from "next";
import Link from "next/link";

import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Terms of sale",
  description: `All sales are final. Defects reported within ${env.REPAIR_WINDOW_DAYS} days are repaired free of charge.`,
};

/** D-11, D-13, US-D3 AC4. Prerendered; the repair window comes from REPAIR_WINDOW_DAYS. */
export default function TermsOfSalePage() {
  const days = env.REPAIR_WINDOW_DAYS;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of sale</h1>
        <p className="text-muted-foreground">
          Every DNA Stitches piece is one of a kind or made to your measurements, so it can&apos;t
          be resold. These terms explain what that means when you buy.
        </p>
      </header>

      <Section title="All sales are final">
        <p>
          We don&apos;t offer refunds, returns or exchanges on ready-to-wear pieces or custom
          orders. You confirm that you understand this before every payment.
        </p>
      </Section>

      <Section title="Custom orders and deposits">
        <p>
          Production on a custom piece starts when you pay the deposit shown on your quote. Deposits
          are non-refundable, including if you cancel the order. The balance is due before you
          collect the piece or we deliver it.
        </p>
      </Section>

      <Section title={`Free repair of defects within ${days} days`}>
        <p>
          If you find a manufacturing defect (for example a seam that comes apart, a faulty zip or a
          fastening that comes loose), report it within {days} days of receiving the piece. That
          means {days} days from when you picked it up or it was delivered. We&apos;ll repair or
          alter it free of charge.
        </p>
        <ul className="list-disc pl-5">
          <li>
            Report it from <Link href="/account/wardrobe">My Wardrobe</Link> using{" "}
            <strong>Report a defect</strong>. Describe the problem and add up to 3 photos.
          </li>
          <li>We&apos;ll email you when we receive it and every time its status changes.</li>
          <li>
            Repairs never involve a payment or a refund. Damage after handover, such as stains,
            tears or wear, isn&apos;t a manufacturing defect, and we&apos;ll explain if we
            can&apos;t cover a report.
          </li>
        </ul>
      </Section>

      <Section title="Prices and payment">
        <p>
          Prices are in Nigerian naira (₦). We take payment securely through Paystack (card, bank
          transfer or USSD), and the studio can record cash or transfer payments. When you check
          out, a ready-to-wear piece is held for you for 15 minutes.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 leading-relaxed [&_a]:underline">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
