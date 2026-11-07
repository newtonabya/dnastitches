/**
 * @jest-environment node
 */
import { demoLinkCapture, isDemoPasscode } from "@/lib/demo-access";

describe("isDemoPasscode", () => {
  it("accepts only the configured passcode (surrounding spaces ignored)", () => {
    expect(isDemoPasscode("correct-horse-battery", "correct-horse-battery")).toBe(true);
    expect(isDemoPasscode("  correct-horse-battery ", "correct-horse-battery")).toBe(true);
    expect(isDemoPasscode("correct-horse-batter", "correct-horse-battery")).toBe(false);
    expect(isDemoPasscode("", "correct-horse-battery")).toBe(false);
    expect(isDemoPasscode(null, "correct-horse-battery")).toBe(false);
  });

  it("is always false when demo access is off", () => {
    expect(isDemoPasscode("anything", undefined)).toBe(false);
  });
});

describe("demoLinkCapture", () => {
  it("only captures inside a demo sign-in", async () => {
    expect(demoLinkCapture.getStore()).toBeUndefined();
    const captured: { url?: string } = {};
    await demoLinkCapture.run(captured, async () => {
      await Promise.resolve();
      demoLinkCapture.getStore()!.url = "https://site/api/auth/callback/resend?token=t";
    });
    expect(captured.url).toContain("token=t");
  });
});
