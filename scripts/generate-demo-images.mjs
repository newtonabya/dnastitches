// Renders the demo artwork in public/demo/ from SVG with Playwright's Chromium.
// Usage: node scripts/generate-demo-images.mjs public/demo
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const out = process.argv[2];
mkdirSync(out, { recursive: true });

const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F1D98A";
const GOLD_DARK = "#8C6A1C";

// Fabric patterns, keyed by name; each is an SVG <pattern> body (tile 40x40).
const patterns = {
  ankara: (c1, c2) => `
    <rect width="40" height="40" fill="${c1}"/>
    <circle cx="20" cy="20" r="11" fill="none" stroke="${c2}" stroke-width="3"/>
    <circle cx="20" cy="20" r="4" fill="${GOLD}"/>
    <circle cx="0" cy="0" r="6" fill="${c2}"/><circle cx="40" cy="0" r="6" fill="${c2}"/>
    <circle cx="0" cy="40" r="6" fill="${c2}"/><circle cx="40" cy="40" r="6" fill="${c2}"/>`,
  adire: (c1, c2) => `
    <rect width="40" height="40" fill="${c1}"/>
    <path d="M0 10 Q10 0 20 10 T40 10 M0 30 Q10 20 20 30 T40 30" fill="none" stroke="${c2}" stroke-width="2.5"/>
    <circle cx="10" cy="20" r="2" fill="${c2}"/><circle cx="30" cy="20" r="2" fill="${c2}"/>`,
  lace: (c1, c2) => `
    <rect width="40" height="40" fill="${c1}"/>
    <g fill="none" stroke="${c2}" stroke-width="1.4" opacity="0.9">
      <circle cx="20" cy="20" r="8"/><circle cx="20" cy="20" r="3"/>
      <path d="M20 4 L20 12 M20 28 L20 36 M4 20 L12 20 M28 20 L36 20"/>
      <circle cx="0" cy="0" r="5"/><circle cx="40" cy="40" r="5"/><circle cx="40" cy="0" r="5"/><circle cx="0" cy="40" r="5"/>
    </g>`,
  aso: (c1, c2) => `
    <rect width="40" height="40" fill="${c1}"/>
    <path d="M0 0 L40 40 M-10 30 L10 50 M30 -10 L50 10" stroke="${c2}" stroke-width="5" opacity="0.55"/>
    <path d="M0 8 L32 40 M8 0 L40 32" stroke="${GOLD}" stroke-width="1" opacity="0.6"/>`,
  silk: (c1, c2) => `
    <rect width="40" height="40" fill="${c1}"/>
    <path d="M0 20 Q20 8 40 20" fill="none" stroke="${c2}" stroke-width="10" opacity="0.25"/>`,
};

function defs(id, pattern, c1, c2, scale = 1) {
  return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="scale(${scale}) rotate(0)">${patterns[pattern](c1, c2)}</pattern>`;
}

function backdrop(w, h) {
  return `
    <defs>
      <radialGradient id="bg" cx="50%" cy="32%" r="75%">
        <stop offset="0" stop-color="#2a2418"/><stop offset="0.55" stop-color="#14120d"/><stop offset="1" stop-color="#0a0907"/>
      </radialGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${GOLD_LIGHT}"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_DARK}"/>
      </linearGradient>
      <radialGradient id="spot" cx="50%" cy="35%" r="45%">
        <stop offset="0" stop-color="${GOLD}" stop-opacity="0.22"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#spot)"/>
    <rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="url(#gold)" stroke-width="1.5" opacity="0.55"/>`;
}

// Garment silhouettes on a 400x600 canvas, centred at x=200; translated/scaled into place.
const garments = {
  gown: `
    <path d="M170 70 Q200 92 230 70 L246 92 Q236 150 238 200 L232 240 Q300 420 336 560 L64 560 Q100 420 168 240 L162 200 Q164 150 154 92 Z"/>`,
  kaftan: `
    <path d="M168 70 Q200 96 232 70 L330 120 L360 300 L300 310 L284 200 L290 560 L110 560 L116 200 L100 310 L40 300 L70 120 Z"/>`,
  agbada: `
    <path d="M170 70 Q200 94 230 70 L380 150 L372 420 L262 440 L270 560 L130 560 L138 440 L28 420 L20 150 Z"/>`,
  twopiece: `
    <path d="M168 70 Q200 94 232 70 L262 96 L268 236 L132 236 L138 96 Z"/>
    <path d="M140 262 L260 262 Q292 420 316 560 L84 560 Q108 420 140 262 Z"/>`,
  wrap: `
    <path d="M168 70 L200 150 L232 70 L262 96 L300 200 L270 214 L254 170 L246 250 Q290 400 320 560 L80 560 Q110 400 154 250 L146 170 L130 214 L100 200 L138 96 Z"/>`,
  jumpsuit: `
    <path d="M168 70 Q200 92 232 70 L258 96 L262 250 L280 560 L216 560 L200 300 L184 560 L120 560 L138 250 L142 96 Z"/>`,
};

function garmentArt({ w, h, garment, pattern, c1, c2, scale = 1.35, label }) {
  const s = Math.min((w * 0.82) / 400, (h * 0.78) / 600);
  const tx = (w - 400 * s) / 2;
  const ty = h * 0.11;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${backdrop(w, h)}
    <defs>${defs("fab", pattern, c1, c2, scale)}
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.65"/></filter>
    </defs>
    <ellipse cx="${w / 2}" cy="${ty + 566 * s}" rx="${170 * s}" ry="${16 * s}" fill="#000" opacity="0.55"/>
    <g transform="translate(${tx} ${ty}) scale(${s})">
      <line x1="200" y1="20" x2="200" y2="70" stroke="url(#gold)" stroke-width="3"/>
      <path d="M150 30 Q200 4 250 30" fill="none" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>
      <g fill="url(#fab)" stroke="url(#gold)" stroke-width="3" stroke-linejoin="round" filter="url(#shadow)">${garments[garment]}</g>
    </g>
    ${label ? `<text x="${w / 2}" y="${h - 52}" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(w / 28)}" letter-spacing="6" fill="${GOLD}" opacity="0.85">${label}</text>` : ""}
  </svg>`;
}

function swatchArt({ pattern, c1, c2 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <defs>${defs("fab", pattern, c1, c2, 2.2)}
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#fab)"/>
    <rect width="600" height="600" fill="url(#sheen)"/>
  </svg>`;
}

const DEMO = "DEMO";
const images = [
  // Products (4:5).
  [
    "product-emerald-gown",
    garmentArt({
      w: 1000,
      h: 1250,
      garment: "gown",
      pattern: "lace",
      c1: "#0f4d3a",
      c2: GOLD_LIGHT,
      label: DEMO,
    }),
  ],
  [
    "product-indigo-kaftan",
    garmentArt({
      w: 1000,
      h: 1250,
      garment: "kaftan",
      pattern: "adire",
      c1: "#1d2a6b",
      c2: "#9fb3ff",
      label: DEMO,
    }),
  ],
  [
    "product-royal-agbada",
    garmentArt({
      w: 1000,
      h: 1250,
      garment: "agbada",
      pattern: "aso",
      c1: "#4a1830",
      c2: "#c46a8f",
      label: DEMO,
    }),
  ],
  [
    "product-ankara-two-piece",
    garmentArt({
      w: 1000,
      h: 1250,
      garment: "twopiece",
      pattern: "ankara",
      c1: "#b5471c",
      c2: "#1b6f6a",
      label: DEMO,
    }),
  ],
  [
    "product-ivory-wrap",
    garmentArt({
      w: 1000,
      h: 1250,
      garment: "wrap",
      pattern: "silk",
      c1: "#e9dfc8",
      c2: "#b9a77a",
      label: DEMO,
    }),
  ],
  [
    "product-onyx-jumpsuit",
    garmentArt({
      w: 1000,
      h: 1250,
      garment: "jumpsuit",
      pattern: "silk",
      c1: "#1a1a1a",
      c2: GOLD,
      label: DEMO,
    }),
  ],
  // Swatches (square).
  ["swatch-emerald-lace", swatchArt({ pattern: "lace", c1: "#0f4d3a", c2: GOLD_LIGHT })],
  ["swatch-indigo-adire", swatchArt({ pattern: "adire", c1: "#1d2a6b", c2: "#9fb3ff" })],
  ["swatch-wine-aso-oke", swatchArt({ pattern: "aso", c1: "#4a1830", c2: "#c46a8f" })],
  ["swatch-sunset-ankara", swatchArt({ pattern: "ankara", c1: "#b5471c", c2: "#1b6f6a" })],
  // Portfolio (4:5, larger; the first is the home-page hero).
  [
    "portfolio-gold-bridal",
    garmentArt({
      w: 1600,
      h: 2000,
      garment: "gown",
      pattern: "lace",
      c1: "#3b2d10",
      c2: GOLD_LIGHT,
      label: DEMO,
    }),
  ],
  [
    "portfolio-adire-kaftan",
    garmentArt({
      w: 1200,
      h: 1500,
      garment: "kaftan",
      pattern: "adire",
      c1: "#13204f",
      c2: "#d7e0ff",
      label: DEMO,
    }),
  ],
  [
    "portfolio-aso-oke-agbada",
    garmentArt({
      w: 1200,
      h: 1500,
      garment: "agbada",
      pattern: "aso",
      c1: "#2b3b1a",
      c2: GOLD,
      label: DEMO,
    }),
  ],
  [
    "portfolio-ankara-wrap",
    garmentArt({
      w: 1200,
      h: 1500,
      garment: "wrap",
      pattern: "ankara",
      c1: "#6b1d1d",
      c2: "#e8b04a",
      label: DEMO,
    }),
  ],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, svg] of images) {
  const w = Number(svg.match(/width="(\d+)"/)[1]);
  const h = Number(svg.match(/height="(\d+)"/)[1]);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: "jpeg", quality: 82 });
  console.log(name);
}
await browser.close();
