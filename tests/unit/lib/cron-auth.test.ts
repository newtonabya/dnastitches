/** @jest-environment node */
import { isAuthorizedCron } from "@/lib/cron-auth";

describe("isAuthorizedCron", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer s3cre", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer s3cret-and-more", "s3cret")).toBe(false);
  });

  it("refuses everything when no secret is configured or no header is sent", () => {
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
  });
});
