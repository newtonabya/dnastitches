import {
  allowSignInEmail,
  createMemoryRateLimiter,
  getClientIp,
  notifyMeRateLimiter,
} from "@/lib/rate-limit";

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

describe("allowSignInEmail (magic-link sign-in)", () => {
  const limiter = (limit: number) =>
    createMemoryRateLimiter({ limit, windowMs: 60_000, now: () => 0 });

  it("limits sign-in emails per address, case-insensitively", async () => {
    const byEmail = limiter(2);
    const opts = { production: false, byEmail, byIp: limiter(100) };
    expect(await allowSignInEmail("Ada@example.com", "1.1.1.1", opts)).toBe(true);
    expect(await allowSignInEmail("ada@example.com ", "2.2.2.2", opts)).toBe(true);
    expect(await allowSignInEmail("ADA@example.com", "3.3.3.3", opts)).toBe(false);
    expect(await allowSignInEmail("bola@example.com", "1.1.1.1", opts)).toBe(true);
  });

  it("limits per IP in production only", async () => {
    const dev = { production: false, byEmail: limiter(100), byIp: limiter(1) };
    expect(await allowSignInEmail("a@example.com", "9.9.9.9", dev)).toBe(true);
    expect(await allowSignInEmail("b@example.com", "9.9.9.9", dev)).toBe(true);
    const prod = { production: true, byEmail: limiter(100), byIp: limiter(1) };
    expect(await allowSignInEmail("a@example.com", "9.9.9.9", prod)).toBe(true);
    expect(await allowSignInEmail("b@example.com", "9.9.9.9", prod)).toBe(false);
    expect(await allowSignInEmail("c@example.com", "8.8.8.8", prod)).toBe(true);
  });
});
