import { HERO_TAG, publicTags } from "@/lib/portfolio";

describe("publicTags", () => {
  it("hides the hero marker, whatever its case, and keeps the rest in order", () => {
    expect(HERO_TAG).toBe("hero");
    expect(publicTags(["bridal", "hero", "lace", "Hero"])).toEqual(["bridal", "lace"]);
    expect(publicTags([])).toEqual([]);
  });
});
