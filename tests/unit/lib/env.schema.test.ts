import { EnvValidationError, REQUIRED_IN_PRODUCTION, parseEnv } from "@/lib/env.schema";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/dnastitches",
  AUTH_SECRET: "test-secret",
};

const fullProduction = {
  ...base,
  NODE_ENV: "production",
  AUTH_RESEND_KEY: "re_test",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
  PAYSTACK_SECRET_KEY: "sk_test_abc",
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_test_abc",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "DNA Stitches <hello@example.com>",
  NEXT_PUBLIC_SITE_URL: "https://dnastitches.example",
};

describe("parseEnv", () => {
  it("applies PRD defaults in development", () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      DEPOSIT_PERCENT: 50,
      REPAIR_WINDOW_DAYS: 7,
      MIN_LEAD_TIME_DAYS: 14,
      STUDIO_TIMEZONE: "Africa/Lagos",
      DEFAULT_CURRENCY: "NGN",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      ADMIN_EMAILS: [],
      googleAuthEnabled: false,
    });
  });

  it("parses booking settings (US-F1)", () => {
    expect(parseEnv(base)).toMatchObject({
      CONSULTATION_MINUTES: 60,
      APPOINTMENTS_AUTO_CONFIRM: false,
    });
    expect(
      parseEnv({ ...base, CONSULTATION_MINUTES: "45", APPOINTMENTS_AUTO_CONFIRM: "true" }),
    ).toMatchObject({ CONSULTATION_MINUTES: 45, APPOINTMENTS_AUTO_CONFIRM: true });
    expect(parseEnv({ ...base, APPOINTMENTS_AUTO_CONFIRM: "" }).APPOINTMENTS_AUTO_CONFIRM).toBe(
      false,
    );
    expect(() => parseEnv({ ...base, CONSULTATION_MINUTES: "5" })).toThrow(/CONSULTATION_MINUTES/);
    expect(() => parseEnv({ ...base, APPOINTMENTS_AUTO_CONFIRM: "yes" })).toThrow(
      /APPOINTMENTS_AUTO_CONFIRM/,
    );
  });

  it("fails the build only for clearly broken EMAIL_FROM values", () => {
    for (const ok of [
      "DNA Stitches <hello@dnastitches.com>",
      "hello@dnastitches.com",
      "DNA Stitches <onboarding@resend.dev>",
      "DNA Stitches<hello@dnastitches.com>",
      '"DNA Stitches" <hello@dnastitches.com>',
      "<hello@dnastitches.com>",
      "DNA Stitches < hello@dnastitches.com >",
    ])
      expect(parseEnv({ ...base, EMAIL_FROM: ok }).EMAIL_FROM).toBe(ok);
    for (const bad of ["DNA Stitches <hello@<your-domain>>", "hello@ <your-domain>", "hello"])
      expect(() => parseEnv({ ...base, EMAIL_FROM: bad })).toThrow(/EMAIL_FROM/);
  });

  it("parses courier settings (v1.2): a Sendbox token needs the pickup address", () => {
    expect(parseEnv(base)).toMatchObject({ COURIER_PARCEL_WEIGHT_KG: 1, COURIER_DEV: false });
    const origin = {
      COURIER_ORIGIN_STREET: "12 Admiralty Way",
      COURIER_ORIGIN_CITY: "Lekki",
      COURIER_ORIGIN_STATE: "Lagos",
      COURIER_ORIGIN_PHONE: "+2348012345678",
    };
    expect(
      parseEnv({ ...base, ...origin, SENDBOX_API_KEY: "tok", COURIER_PARCEL_WEIGHT_KG: "1.5" }),
    ).toMatchObject({ SENDBOX_API_KEY: "tok", COURIER_PARCEL_WEIGHT_KG: 1.5 });
    expect(() => parseEnv({ ...base, SENDBOX_API_KEY: "tok" })).toThrow(/COURIER_ORIGIN_STREET/);
    expect(() => parseEnv({ ...base, COURIER_PARCEL_WEIGHT_KG: "0" })).toThrow(
      /COURIER_PARCEL_WEIGHT_KG/,
    );
    expect(() => parseEnv({ ...base, SENDBOX_BASE_URL: "not a url" })).toThrow(/SENDBOX_BASE_URL/);
  });

  it("parses text-reminder settings (v1.2): key and sender ID together, channel default dnd", () => {
    expect(parseEnv(base)).toMatchObject({ TERMII_CHANNEL: "dnd" });
    expect(
      parseEnv({
        ...base,
        TERMII_API_KEY: "k",
        TERMII_SENDER_ID: "DNA",
        TERMII_CHANNEL: "whatsapp",
      }),
    ).toMatchObject({ TERMII_API_KEY: "k", TERMII_SENDER_ID: "DNA", TERMII_CHANNEL: "whatsapp" });
    expect(() => parseEnv({ ...base, TERMII_API_KEY: "k" })).toThrow(/TERMII_SENDER_ID/);
    expect(() => parseEnv({ ...base, TERMII_CHANNEL: "carrier-pigeon" })).toThrow(/TERMII_CHANNEL/);
  });

  it("requires DATABASE_URL and AUTH_SECRET everywhere", () => {
    expect(() => parseEnv({ AUTH_SECRET: "x" })).toThrow(EnvValidationError);
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv({ ...base, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("parses numeric vars and treats empty strings as unset", () => {
    const env = parseEnv({
      ...base,
      DEPOSIT_PERCENT: "40",
      REPAIR_WINDOW_DAYS: "",
      MIN_LEAD_TIME_DAYS: "21",
      CRON_SECRET: "",
    });
    expect(env.DEPOSIT_PERCENT).toBe(40);
    expect(env.REPAIR_WINDOW_DAYS).toBe(7);
    expect(env.MIN_LEAD_TIME_DAYS).toBe(21);
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it.each([["101"], ["-1"], ["abc"], ["12.5"]])("rejects DEPOSIT_PERCENT=%s", (value) => {
    expect(() => parseEnv({ ...base, DEPOSIT_PERCENT: value })).toThrow(/DEPOSIT_PERCENT/);
  });

  it("normalises ADMIN_EMAILS and rejects invalid entries", () => {
    expect(
      parseEnv({ ...base, ADMIN_EMAILS: " Owner@Example.com, ,b@example.com" }).ADMIN_EMAILS,
    ).toEqual(["owner@example.com", "b@example.com"]);
    expect(() => parseEnv({ ...base, ADMIN_EMAILS: "not-an-email" })).toThrow(/ADMIN_EMAILS/);
  });

  it("validates Paystack key prefixes", () => {
    expect(() => parseEnv({ ...base, PAYSTACK_SECRET_KEY: "pk_test_x" })).toThrow(
      /PAYSTACK_SECRET_KEY/,
    );
    expect(() => parseEnv({ ...base, NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "sk_live_x" })).toThrow(
      /NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY/,
    );
  });

  it("validates STUDIO_TIMEZONE", () => {
    expect(() => parseEnv({ ...base, STUDIO_TIMEZONE: "Mars/Olympus" })).toThrow(/STUDIO_TIMEZONE/);
  });

  it("only allows NGN as the currency (D-8)", () => {
    expect(() => parseEnv({ ...base, DEFAULT_CURRENCY: "USD" })).toThrow(/DEFAULT_CURRENCY/);
  });

  it("accepts a complete production environment", () => {
    expect(parseEnv(fullProduction).NODE_ENV).toBe("production");
  });

  it.each(REQUIRED_IN_PRODUCTION)("requires %s in production", (key) => {
    const env: Record<string, string | undefined> = { ...fullProduction, [key]: undefined };
    expect(() => parseEnv(env)).toThrow(new RegExp(key));
  });

  it("requires Google credentials together", () => {
    expect(() => parseEnv({ ...fullProduction, AUTH_GOOGLE_ID: "id" })).toThrow(/AUTH_GOOGLE/);
    expect(
      parseEnv({ ...fullProduction, AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" })
        .googleAuthEnabled,
    ).toBe(true);
  });
});
