import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

type Db = Pick<PrismaClient, "portfolioItem" | "fabricSwatch">;

export interface PortfolioCardData {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  tags: string[];
}

/** Published portfolio items, newest first, optionally filtered by tag (US-B2 AC1). */
export async function listPublishedPortfolio(db: Db, tag?: string): Promise<PortfolioCardData[]> {
  return db.portfolioItem.findMany({
    where: { isPublished: true, ...(tag ? { tags: { has: tag } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: { id: true, title: true, description: true, imageUrl: true, tags: true },
  });
}

/** Distinct tags across published items, alphabetical. */
export async function listPortfolioTags(db: Db): Promise<string[]> {
  const rows = await db.portfolioItem.findMany({
    where: { isPublished: true },
    select: { tags: true },
  });
  return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
}

export interface SwatchOption {
  id: string;
  name: string;
  colorHex: string;
  imageUrl: string;
  composition: string;
}

/** Swatches customers can pick for a custom request (US-B1 step 2). */
export async function listAvailableSwatches(db: Db): Promise<SwatchOption[]> {
  return db.fabricSwatch.findMany({
    where: { isAvailable: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, colorHex: true, imageUrl: true, composition: true },
  });
}
