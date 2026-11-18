/**
 * The portfolio tag that picks the home-page hero photo (Admin → Portfolio). It's a
 * setting, not a style, so customers never see it as a tag or a filter.
 */
export const HERO_TAG = "hero";

/** Tags to show customers: everything except the hero marker. */
export function publicTags(tags: string[]): string[] {
  return tags.filter((t) => t.toLowerCase() !== HERO_TAG);
}
