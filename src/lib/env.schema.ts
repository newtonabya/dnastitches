import { z } from "zod";

/**
 * Environment variable schema (PRD §9 "Required Environment Variables").
 *
 * Kept separate from `env.ts` so it can be unit-tested without reading the real
 * process environment. Third-party service keys are required in production
 * (and therefore during `next build`) but optional in development and test so
 * the app can boot before every account is set up.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const intFromString = (min: number, max: number, fallback: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().int().min(min).max(max));

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Keys that must be present when NODE_ENV=production. */
export const REQUIRED_IN_PRODUCTION = [
  "AUTH_RESEND_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "PAYSTACK_SECRET_KEY",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "NEXT_PUBLIC_SITE_URL",
] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Database
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    // Auth.js
    // Required in every environment: Auth.js refuses to run without it.
    AUTH_SECRET: z.string().trim().min(1, "is required (run `npx auth secret`)"),
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,
    AUTH_RESEND_KEY: optionalString,
    ADMIN_EMAILS: z
      .string()
      .optional()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.email())),

    // Storage
    BLOB_READ_WRITE_TOKEN: optionalString,

    // Payments (Paystack)
    PAYSTACK_SECRET_KEY: optionalString.pipe(
      z
        .string()
        .regex(/^sk_(test|live)_/, "must start with sk_test_ or sk_live_")
        .optional(),
    ),
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: optionalString.pipe(
      z
        .string()
        .regex(/^pk_(test|live)_/, "must start with pk_test_ or pk_live_")
        .optional(),
    ),
    DEPOSIT_PERCENT: intFromString(0, 100, 50),
    REPAIR_WINDOW_DAYS: intFromString(1, 365, 7),

    // Email
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,

    // Cron (v1.1)
    CRON_SECRET: optionalString,

    // App
    NEXT_PUBLIC_SITE_URL: optionalString.pipe(z.url().optional()),
    STUDIO_TIMEZONE: z
      .string()
      .optional()
      .default("Africa/Lagos")
      .refine(isValidTimeZone, "must be a valid IANA time zone"),
    DEFAULT_CURRENCY: z.literal("NGN").optional().default("NGN"),
    MIN_LEAD_TIME_DAYS: intFromString(0, 365, 14),
    // Shown at checkout for pickup (US-A4 AC2).
    STUDIO_ADDRESS: optionalString,
    STUDIO_HOURS: optionalString,
    // Booking (US-F1): consultation length, and whether bookings are confirmed instantly.
    CONSULTATION_MINUTES: intFromString(15, 240, 60),
    APPOINTMENTS_AUTO_CONFIRM: z
      .enum(["true", "false", ""])
      .optional()
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "is required in production",
        });
      }
    }
    if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_GOOGLE_SECRET"],
        message: "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set together",
      });
    }
  })
  .transform((env) => ({
    ...env,
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    googleAuthEnabled: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
  }));

export type Env = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(details: string) {
    super(`❌ Invalid environment variables:\n${details}`);
    this.name = "EnvValidationError";
  }
}

/** Parse and validate an environment record. Throws `EnvValidationError` on failure. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(z.prettifyError(result.error));
  }
  return result.data;
}
