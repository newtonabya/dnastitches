/**
 * Rate limiting (PRD US-D2 DoD).
 *
 * `RateLimiter` is the abstraction Server Actions depend on. The in-memory
 * implementation is fine for development and single-instance deployments; on
 * Vercel (many short-lived instances) it is best-effort only, so production
 * should swap in a shared store (Upstash / Vercel KV) behind the same interface.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

export interface MemoryRateLimiterOptions {
  /** Max requests per window. */
  limit: number;
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Fixed-window in-memory limiter. */
export function createMemoryRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: MemoryRateLimiterOptions): RateLimiter {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be >= 1");
  if (!(windowMs > 0)) throw new RangeError("windowMs must be > 0");
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async limit(key) {
      const t = now();
      // Opportunistic cleanup so the map cannot grow without bound.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
      }
      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      return {
        success: w.count <= limit,
        remaining: Math.max(0, limit - w.count),
        resetAt: w.resetAt,
      };
    },
  };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/** US-D2 AC3: 5 notify-me requests per IP per 10 minutes. */
export const notifyMeRateLimiter = createMemoryRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/** Magic-link sign-in: per address, so nobody can flood one inbox with sign-in emails. */
export const signInEmailRateLimiter = createMemoryRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000,
});
/** Magic-link sign-in: per IP, to slow down sending to many addresses (production only). */
export const signInIpRateLimiter = createMemoryRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 });

/**
 * Whether a magic-link request may go out. The per-IP limit applies in production only:
 * local E2E runs sign in dozens of accounts from one address within minutes.
 */
export async function allowSignInEmail(
  email: string,
  ip: string,
  {
    production,
    byEmail = signInEmailRateLimiter,
    byIp = signInIpRateLimiter,
  }: { production: boolean; byEmail?: RateLimiter; byIp?: RateLimiter },
): Promise<boolean> {
  if (!(await byEmail.limit(`signin:email:${email.trim().toLowerCase()}`)).success) return false;
  if (production && !(await byIp.limit(`signin:ip:${ip}`)).success) return false;
  return true;
}
