/**
 * Development seed data (PRD US-A1 DoD, D-12, US-E1 AC2).
 *
 * Idempotent: safe to run repeatedly (`pnpm db:seed`). Creates:
 * - fabric swatches
 * - products in every inventory status (≥ 3 each) + one unpublished draft
 * - portfolio items
 * - clearly-labelled PLACEHOLDER delivery zones (D-12: real zones/fees are a launch-blocking task)
 * - admin users for every address in ADMIN_EMAILS
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { deriveInventoryStatus } from "../src/lib/inventory";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const naira = (amount: number) => amount * 100;
const placeholderImage = (label: string) =>
  `https://placehold.co/800x1000/png?text=${encodeURIComponent(label)}`;

const swatches = [
  {
    id: "seed-swatch-indigo-adire",
    name: "Indigo Adire",
    colorHex: "#2E3A87",
    composition: "100% cotton, hand-dyed",
  },
  {
    id: "seed-swatch-gold-aso-oke",
    name: "Gold Aso-Oke",
    colorHex: "#C9A227",
    composition: "Hand-woven cotton & lurex",
  },
  {
    id: "seed-swatch-ivory-silk",
    name: "Ivory Silk",
    colorHex: "#F4EEDC",
    composition: "100% mulberry silk",
  },
  {
    id: "seed-swatch-emerald-ankara",
    name: "Emerald Ankara",
    colorHex: "#1F7A4D",
    composition: "100% cotton wax print",
  },
  {
    id: "seed-swatch-blush-lace",
    name: "Blush Lace",
    colorHex: "#E8B4B8",
    composition: "Polyester lace on cotton lining",
  },
  {
    id: "seed-swatch-sand-linen",
    name: "Sand Linen",
    colorHex: "#D8C3A5",
    composition: "100% linen",
  },
] as const;

type SeedProduct = {
  slug: string;
  name: string;
  priceNaira: number;
  quantity: number;
  sizeLabel?: string;
  measurements: [bust: number | null, waist: number, hips: number, length: number];
  swatchId?: (typeof swatches)[number]["id"];
  isPublished?: boolean;
};

const products: SeedProduct[] = [
  // AVAILABLE (quantity > low-stock threshold of 1)
  {
    slug: "adire-wrap-dress",
    name: "Adire Wrap Dress",
    priceNaira: 185_000,
    quantity: 3,
    sizeLabel: "UK 10",
    measurements: [88, 70, 96, 120],
    swatchId: "seed-swatch-indigo-adire",
  },
  {
    slug: "linen-kaftan",
    name: "Sand Linen Kaftan",
    priceNaira: 120_000,
    quantity: 2,
    sizeLabel: "M",
    measurements: [104, 98, 110, 135],
    swatchId: "seed-swatch-sand-linen",
  },
  {
    slug: "ankara-two-piece",
    name: "Emerald Ankara Two-Piece",
    priceNaira: 150_000,
    quantity: 4,
    sizeLabel: "UK 12",
    measurements: [92, 74, 100, 105],
    swatchId: "seed-swatch-emerald-ankara",
  },
  // LOW_STOCK ("Last One")
  {
    slug: "aso-oke-corset",
    name: "Gold Aso-Oke Corset",
    priceNaira: 260_000,
    quantity: 1,
    sizeLabel: "UK 8",
    measurements: [84, 64, 92, 45],
    swatchId: "seed-swatch-gold-aso-oke",
  },
  {
    slug: "silk-slip-dress",
    name: "Ivory Silk Slip Dress",
    priceNaira: 210_000,
    quantity: 1,
    sizeLabel: "S",
    measurements: [86, 68, 94, 125],
    swatchId: "seed-swatch-ivory-silk",
  },
  {
    slug: "lace-peplum-top",
    name: "Blush Lace Peplum Top",
    priceNaira: 95_000,
    quantity: 1,
    sizeLabel: "UK 14",
    measurements: [98, 80, 106, 62],
    swatchId: "seed-swatch-blush-lace",
  },
  // SOLD_OUT
  {
    slug: "adire-maxi-skirt",
    name: "Adire Maxi Skirt",
    priceNaira: 110_000,
    quantity: 0,
    sizeLabel: "UK 10",
    measurements: [null, 70, 98, 110],
    swatchId: "seed-swatch-indigo-adire",
  },
  {
    slug: "aso-oke-agbada-set",
    name: "Aso-Oke Agbada Set",
    priceNaira: 450_000,
    quantity: 0,
    sizeLabel: "L",
    measurements: [118, 104, 116, 150],
    swatchId: "seed-swatch-gold-aso-oke",
  },
  {
    slug: "emerald-bubu",
    name: "Emerald Bubu Gown",
    priceNaira: 175_000,
    quantity: 0,
    sizeLabel: "Free size",
    measurements: [120, 120, 125, 145],
    swatchId: "seed-swatch-emerald-ankara",
  },
  // Unpublished draft — must never appear on /shop (US-A1 AC5)
  {
    slug: "draft-silk-blazer",
    name: "Silk Blazer (draft)",
    priceNaira: 230_000,
    quantity: 1,
    sizeLabel: "M",
    measurements: [96, 82, 100, 70],
    swatchId: "seed-swatch-ivory-silk",
    isPublished: false,
  },
];

const portfolioItems = [
  {
    id: "seed-portfolio-bridal-aso-oke",
    title: "Bridal Aso-Oke Ensemble",
    tags: ["bridal", "aso-oke", "traditional"],
    sourceSlug: "aso-oke-agbada-set",
  },
  {
    id: "seed-portfolio-adire-gown",
    title: "Adire Evening Gown",
    tags: ["evening", "adire"],
    sourceSlug: "adire-maxi-skirt",
  },
  {
    id: "seed-portfolio-silk-reception",
    title: "Silk Reception Dress",
    tags: ["bridal", "silk", "reception"],
  },
  {
    id: "seed-portfolio-ankara-suit",
    title: "Tailored Ankara Suit",
    tags: ["menswear", "ankara", "suiting"],
  },
  { id: "seed-portfolio-lace-owambe", title: "Owambe Lace Set", tags: ["party", "lace"] },
  { id: "seed-portfolio-linen-resort", title: "Resort Linen Co-ord", tags: ["casual", "linen"] },
];

// D-12: PLACEHOLDER zones so delivery flows can be built and tested.
// The owner must replace these with real zones and fees in /admin/settings before launch.
const deliveryZones = [
  {
    id: "seed-zone-lagos-mainland",
    name: "PLACEHOLDER — Lagos Mainland",
    states: ["Lagos"],
    feeNaira: 3_500,
    etaDays: 2,
  },
  {
    id: "seed-zone-south-west",
    name: "PLACEHOLDER — South West",
    states: ["Ogun", "Oyo", "Osun", "Ondo", "Ekiti"],
    feeNaira: 6_000,
    etaDays: 4,
  },
  {
    id: "seed-zone-fct",
    name: "PLACEHOLDER — Abuja (FCT)",
    states: ["FCT"],
    feeNaira: 7_500,
    etaDays: 4,
  },
  {
    id: "seed-zone-rest-of-nigeria",
    name: "PLACEHOLDER — Rest of Nigeria",
    states: [
      "Rivers",
      "Enugu",
      "Kano",
      "Kaduna",
      "Delta",
      "Edo",
      "Anambra",
      "Cross River",
      "Akwa Ibom",
      "Plateau",
    ],
    feeNaira: 10_000,
    etaDays: 7,
  },
];

async function seedSwatches() {
  for (const [index, s] of swatches.entries()) {
    const data = {
      name: s.name,
      colorHex: s.colorHex,
      composition: s.composition,
      imageUrl: placeholderImage(s.name),
      isAvailable: true,
      sortOrder: index,
    };
    await prisma.fabricSwatch.upsert({
      where: { id: s.id },
      update: data,
      create: { id: s.id, ...data },
    });
  }
  console.log(`✓ ${swatches.length} fabric swatches`);
}

async function seedProducts() {
  for (const p of products) {
    const [bustCm, waistCm, hipsCm, lengthCm] = p.measurements;
    const data = {
      name: p.name,
      description: `${p.name} — a 1-of-1 piece from the DNA Stitches atelier. (Seed data.)`,
      priceKobo: naira(p.priceNaira),
      currency: "NGN",
      quantity: p.quantity,
      inventoryStatus: deriveInventoryStatus(p.quantity),
      bustCm,
      waistCm,
      hipsCm,
      lengthCm,
      sizeLabel: p.sizeLabel ?? null,
      fabricComposition: swatches.find((s) => s.id === p.swatchId)?.composition ?? "See label",
      careInstructions: "Dry clean only. Store on a padded hanger away from direct sunlight.",
      isPublished: p.isPublished ?? true,
      fabricSwatchId: p.swatchId ?? null,
    };
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.createMany({
      data: [0, 1].map((i) => ({
        productId: product.id,
        url: placeholderImage(`${p.name} ${i + 1}`),
        alt: `${p.name} — view ${i + 1}`,
        sortOrder: i,
      })),
    });
  }
  const counts = await prisma.product.groupBy({ by: ["inventoryStatus"], _count: true });
  console.log(
    `✓ ${products.length} products (${counts.map((c) => `${c.inventoryStatus}: ${c._count}`).join(", ")})`,
  );
}

async function seedPortfolio() {
  for (const item of portfolioItems) {
    const source = item.sourceSlug
      ? await prisma.product.findUnique({ where: { slug: item.sourceSlug }, select: { id: true } })
      : null;
    const data = {
      title: item.title,
      description: `${item.title} commissioned by a DNA Stitches client. (Seed data.)`,
      imageUrl: placeholderImage(item.title),
      tags: item.tags,
      isPublished: true,
      sourceProductId: source?.id ?? null,
    };
    await prisma.portfolioItem.upsert({
      where: { id: item.id },
      update: data,
      create: { id: item.id, ...data },
    });
  }
  console.log(`✓ ${portfolioItems.length} portfolio items`);
}

async function seedDeliveryZones() {
  for (const z of deliveryZones) {
    const data = {
      name: z.name,
      states: z.states,
      feeKobo: naira(z.feeNaira),
      etaDays: z.etaDays,
      isActive: true,
    };
    await prisma.deliveryZone.upsert({
      where: { id: z.id },
      update: data,
      create: { id: z.id, ...data },
    });
  }
  console.log(
    `✓ ${deliveryZones.length} PLACEHOLDER delivery zones — replace with real zones/fees before launch (D-12)`,
  );
}

/**
 * Starter booking hours (US-F1): Tuesday–Saturday, 10:00–16:00 studio time. Only
 * created when no hours exist, so the owner's own hours (set in /admin/settings) are kept.
 */
async function seedAvailability() {
  if ((await prisma.availabilityRule.count()) > 0) {
    console.log("✓ booking hours already set — left unchanged");
    return;
  }
  await prisma.availabilityRule.createMany({
    data: [2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 10 * 60, endMinute: 16 * 60 })),
  });
  console.log("✓ starter booking hours: Tue–Sat 10:00–16:00 (edit them in /admin/settings)");
}

async function seedAdmins() {
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    console.warn("! ADMIN_EMAILS is empty — no admin user created");
    return;
  }
  for (const email of emails) {
    await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN" },
      create: { email, name: "DNA Stitches Admin", role: "ADMIN" },
    });
  }
  console.log(`✓ ${emails.length} admin user(s): ${emails.join(", ")}`);
}

async function main() {
  await seedSwatches();
  await seedProducts();
  await seedPortfolio();
  await seedDeliveryZones();
  await seedAvailability();
  await seedAdmins();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
