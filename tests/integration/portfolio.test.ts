import {
  listAvailableSwatches,
  listPortfolioTags,
  listPublishedPortfolio,
} from "@/server/data/portfolio";

import { createTestPrisma, uid } from "./helpers/db";

const prisma = createTestPrisma();
const prefix = uid("portfolio");
const tag = `${prefix}-tag`;

beforeAll(async () => {
  await prisma.portfolioItem.createMany({
    data: [
      {
        id: `${prefix}-pub`,
        title: "Pub",
        description: "x",
        imageUrl: "https://placehold.co/a.png",
        tags: [tag, "bridal"],
        isPublished: true,
      },
      {
        id: `${prefix}-draft`,
        title: "Draft",
        description: "x",
        imageUrl: "https://placehold.co/b.png",
        tags: [tag, `${prefix}-hidden`],
        isPublished: false,
      },
    ],
  });
  await prisma.fabricSwatch.createMany({
    data: [
      {
        id: `${prefix}-sw-on`,
        name: "On",
        colorHex: "#000000",
        imageUrl: "https://placehold.co/c.png",
        composition: "x",
        isAvailable: true,
      },
      {
        id: `${prefix}-sw-off`,
        name: "Off",
        colorHex: "#ffffff",
        imageUrl: "https://placehold.co/d.png",
        composition: "x",
        isAvailable: false,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.portfolioItem.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.fabricSwatch.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe("portfolio (US-B2 AC1)", () => {
  it("lists only published items, filterable by tag", async () => {
    expect((await listPublishedPortfolio(prisma, tag)).map((i) => i.id)).toEqual([`${prefix}-pub`]);
    expect((await listPublishedPortfolio(prisma)).map((i) => i.id)).not.toContain(
      `${prefix}-draft`,
    );
  });

  it("tags come from published items only", async () => {
    const tags = await listPortfolioTags(prisma);
    expect(tags).toContain(tag);
    expect(tags).not.toContain(`${prefix}-hidden`);
    expect([...tags].sort((a, b) => a.localeCompare(b))).toEqual(tags);
  });

  it("swatches exclude unavailable fabrics", async () => {
    const ids = (await listAvailableSwatches(prisma)).map((s) => s.id);
    expect(ids).toContain(`${prefix}-sw-on`);
    expect(ids).not.toContain(`${prefix}-sw-off`);
  });
});
