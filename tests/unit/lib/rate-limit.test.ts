import { createMemoryRateLimiter, getClientIp, notifyMeRateLimiter } from "@/lib/rate-limit";

describe("createMemoryRateLimiter", () => {
  it("allows `limit` requests per window per key, then blocks until reset", async () => {
    let t = 1_000;
    const rl = createMemoryRateLimiter({ limit: 2, windowMs: 100, now: () => t });

    expect(await rl.limit("a")).toEqual({ success: true, remaining: 1, resetAt: 1_100 });
    expect(await rl.limit("a")).toEqual({ success: true, remaining: 0, resetAt: 1_100 });
    expect(await rl.limit("a")).toEqual({ success: false, remaining: 0, resetAt: 1_100 });
    // Other keys are independent.
    expect((await rl.limit("b")).success).toBe(true);

    t = 1_100; // window boundary resets
    expect(await rl.limit("a")).toEqual({ success: true, remaining: 1, resetAt: 1_200 });
  });

  it("validates options", () => {
    expect(() => createMemoryRateLimiter({ limit: 0, windowMs: 1 })).toThrow(RangeError);
    expect(() => createMemoryRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError);
  });

  it("evicts expired windows once the map is large", async () => {
    let t = 0;
    const rl = createMemoryRateLimiter({ limit: 1, windowMs: 10, now: () => t });
    for (let i = 0; i <= 10_001; i++) await rl.limit(`k${i}`);
    t = 100;
    expect((await rl.limit("k0")).success).toBe(true);
  });

  it("notify-me limiter allows 5 then blocks (US-D2 AC3)", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect((await notifyMeRateLimiter.limit(key)).success).toBe(true);
    expect((await notifyMeRateLimiter.limit(key)).success).toBe(false);
  });
});

describe("getClientIp", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("uses the first x-forwarded-for entry", () => {
    expect(getClientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(getClientIp(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(getClientIp(h({}))).toBe("unknown");
  });
});
