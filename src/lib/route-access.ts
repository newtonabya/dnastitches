/**
 * Route access rules used by `src/proxy.ts` (PRD §7 Route Map, US-E1).
 * Pure so they can be unit-tested; server layouts and actions re-check authorisation.
 */

export type RouteAccess = "public" | "customer" | "admin";

const ADMIN_PREFIXES = ["/admin"] as const;
const CUSTOMER_PREFIXES = ["/account", "/custom/request", "/custom/book", "/checkout"] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getRouteAccess(pathname: string): RouteAccess {
  if (ADMIN_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "admin";
  if (CUSTOMER_PREFIXES.some((p) => matchesPrefix(pathname, p))) return "customer";
  return "public";
}

/**
 * Restrict a `callbackUrl` to same-origin paths (US-E1 AC3).
 * Accepts only relative paths starting with a single "/"; anything else falls back.
 */
export function safeCallbackUrl(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  try {
    // Reject anything that would resolve to a different origin.
    const base = "http://dna.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function signInUrl(callbackPath: string): string {
  return `/sign-in?callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackPath))}`;
}
