import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  listAvailableSwatches,
  listPortfolioTags,
  listPublishedPortfolio,
  type PortfolioCardData,
  type SwatchOption,
} from "@/server/data/portfolio";

/** Admin portfolio and swatch mutations (US-C3) must `updateTag` these. */
export const PORTFOLIO_TAG = "portfolio";
export const SWATCHES_TAG = "swatches";

export async function getPortfolio(tag?: string): Promise<PortfolioCardData[]> {
  "use cache";
  cacheTag(PORTFOLIO_TAG);
  cacheLife("minutes");
  return listPublishedPortfolio(prisma, tag);
}

export async function getPortfolioTags(): Promise<string[]> {
  "use cache";
  cacheTag(PORTFOLIO_TAG);
  cacheLife("minutes");
  return listPortfolioTags(prisma);
}

export async function getAvailableSwatches(): Promise<SwatchOption[]> {
  "use cache";
  cacheTag(SWATCHES_TAG);
  cacheLife("minutes");
  return listAvailableSwatches(prisma);
}
