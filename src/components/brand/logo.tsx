import { cn } from "@/lib/utils";

/**
 * The DNA Stitches monogram: "DS" either side of a DNA double helix, with a pair of
 * scissors beneath, inside a fine gold ring. Decorative: always shown next to the name.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("size-10 text-primary", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <circle cx="32" cy="32" r="30.5" strokeWidth="1" />
      <circle cx="32" cy="32" r="28" strokeWidth="0.4" opacity="0.6" />
      {/* Double helix. */}
      <path d="M27 9c0 5.5 10 5.5 10 11.5S27 26.5 27 32s10 5.5 10 11.5" strokeWidth="1.2" />
      <path d="M37 9c0 5.5-10 5.5-10 11.5S37 26.5 37 32s-10 5.5-10 11.5" strokeWidth="1.2" />
      <g strokeWidth="0.7" opacity="0.65">
        <path d="M28.5 11h7M29.5 17.5h5M28.5 23.5h7M29.5 29.5h5M28.5 35.5h7M29.5 41.5h5" />
      </g>
      {/* Scissors. */}
      <g strokeWidth="1">
        <circle cx="29" cy="55" r="2.2" />
        <circle cx="35" cy="55" r="2.2" />
        <path d="M30.4 53.3 35.5 46.5M33.6 53.3 28.5 46.5" />
      </g>
      {/* Monogram. */}
      <g
        fill="currentColor"
        stroke="none"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="22"
        fontWeight="600"
        textAnchor="middle"
      >
        <text x="17" y="34">
          D
        </text>
        <text x="47" y="34">
          S
        </text>
      </g>
    </svg>
  );
}

/**
 * The simplified mark, for small sizes (app icon, favicon, the mobile header):
 * an interlaced "D" and "S" with a small pair of scissors, inside a gold ring.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("size-9 text-primary", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <LogoMarkPaths />
    </svg>
  );
}

/** Shared with the app icon (src/app/icon.svg), which must stay a static file. */
export function LogoMarkPaths() {
  return (
    <>
      <circle cx="32" cy="32" r="30" strokeWidth="1.6" />
      {/* D */}
      <path d="M17 15v34M17 15h8c10 0 16 7 16 17s-6 17-16 17h-8" strokeWidth="3" />
      {/* S, interlaced through the D */}
      <path
        d="M47 19.5c-1.8-2.7-4.8-4-8-4-4.6 0-8 2.7-8 6.6 0 8.6 17 5.4 17 15.4 0 4.6-4.1 8-9.4 8-3.8 0-7.1-1.6-9-4.6"
        strokeWidth="3"
      />
      {/* Scissors */}
      <g strokeWidth="1.4">
        <circle cx="28.5" cy="56" r="1.8" />
        <circle cx="35.5" cy="56" r="1.8" />
        <path d="M29.8 54.6 35 50M34.2 54.6 29 50" />
      </g>
    </>
  );
}
