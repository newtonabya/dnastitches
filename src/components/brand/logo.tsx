import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The DNA Stitches logo (option A, "The Crest"): a gold D and S, an evening gown on a
 * hanger inside the D, tailor's shears and a nameplate band. Source files, including
 * print versions with the "Tailored to your DNA" tagline, are in public/brand/.
 */

/** The monogram alone (D, S and the gown), for the header. Decorative: the name is beside it. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/dna-stitches-mark.svg"
      alt=""
      width={382}
      height={346}
      unoptimized
      className={cn("h-10 w-auto", className)}
    />
  );
}

/** The full lockup with the nameplate, for the home page hero. Its alt text is the name. */
export function LogoLockup({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/dna-stitches-lockup-dark.svg"
      alt="DNA Stitches"
      width={584}
      height={364}
      priority={priority}
      unoptimized
      className={cn("h-auto w-full", className)}
    />
  );
}
