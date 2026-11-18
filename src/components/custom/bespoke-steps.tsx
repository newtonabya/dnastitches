import { cn } from "@/lib/utils";

/** The made-to-measure journey (US-B1), shown on the custom landing page and the home page. */
export const BESPOKE_STEPS = [
  {
    title: "Share your idea",
    body: "Describe the piece, add up to 5 reference images and tell us the occasion.",
  },
  { title: "Pick a fabric", body: "Choose from our swatches, or let us advise you." },
  {
    title: "Measurements",
    body: "Use saved measurements, enter new ones, or book a measurement appointment.",
  },
  {
    title: "Quote & deposit",
    body: "We send a quote. Production starts once the deposit is paid.",
  },
  {
    title: "Fittings & handover",
    body: "Follow progress in My Wardrobe, then collect or get it delivered.",
  },
] as const;

export function BespokeSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {BESPOKE_STEPS.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-2 rounded-md border bg-card p-5">
          <span aria-hidden className="font-serif text-3xl leading-none text-primary">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="font-medium">
            <span className="sr-only">Step {i + 1}: </span>
            {step.title}
          </h3>
          <p className="text-sm text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
