import type { MetadataRoute } from "next";

/** Lets customers add the shop to their phone's home screen as an app-like icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DNA Stitches",
    short_name: "DNA Stitches",
    description: "1-of-1 ready-to-wear and made-to-measure tailoring from our Lagos atelier.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0d0b",
    theme_color: "#0e0d0b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
