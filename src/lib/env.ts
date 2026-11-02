import { parseEnv } from "./env.schema";

/**
 * Validated server environment (PRD §9 rule 5).
 *
 * Imported by `next.config.ts`, so a missing or malformed variable fails
 * `next dev` / `next build` at boot. Server-side only: browser bundles do not
 * receive non-`NEXT_PUBLIC_` variables.
 */
export const env = parseEnv(process.env);

export type { Env } from "./env.schema";
