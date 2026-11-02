# DNA Stitches

> Tailored to your DNA.

A dual-purpose fashion platform: a curated shop for 1-of-1 ready-to-wear pieces and an end-to-end
custom tailoring journey, run from an admin CRM. **[`PRD.md`](./PRD.md) is the single source of
truth** for product behaviour, data model and architecture.

**Status:** Phase 3, building the MVP stories. Done so far:

- **Customer side:** sign-in and profile (US-E1); the shop gallery, product detail and notify-me (US-A1, A2, D2); the custom journey (US-A3, B1, B2, B3).
- **Admin side:** the order pipeline and order detail (US-C1), client profiles (US-C2), and quotes and offline payments (admin side of US-C4).

Still to come: catalog management (US-C3), Paystack payments, My Wardrobe and repairs.

## Stack

| Concern         | Choice                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Cache Components, Turbopack), React 19               |
| Language        | TypeScript (`strict`, `noUncheckedIndexedAccess`)                            |
| Styling         | Tailwind CSS v4 + shadcn/ui (new-york, neutral)                              |
| Database / ORM  | PostgreSQL (Neon or Supabase) + Prisma 7 (`@prisma/adapter-pg`)              |
| Auth            | Auth.js v5 (`next-auth@beta`) + Prisma adapter; Resend magic link and Google |
| Validation      | Zod 4                                                                        |
| Payments        | Paystack (NGN)                                                               |
| Email / storage | Resend; Vercel Blob                                                          |
| Testing         | Jest + React Testing Library (jsdom); Playwright                             |
| Tooling         | pnpm, ESLint, Prettier, GitHub Actions; Node ≥ 20.19 (`.nvmrc` → 22)         |

## Accounts you need

| Service                                                           | Used for                                                                       | Needed for local dev?               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| [Neon](https://neon.tech) **or** [Supabase](https://supabase.com) | PostgreSQL (separate dev / preview / prod DBs or branches)                     | Yes, or run Postgres locally        |
| [Paystack](https://paystack.com)                                  | Payments: use **test** keys (`sk_test_…`, `pk_test_…`)                         | Only when building checkout         |
| [Resend](https://resend.com)                                      | Magic-link sign-in emails and transactional email (verify your sending domain) | Needed to actually sign in by email |
| [Vercel](https://vercel.com)                                      | Hosting, preview deploys, Blob storage, Cron                                   | Only for deploys and uploads        |
| [Google Cloud](https://console.cloud.google.com) _(optional)_     | Google OAuth sign-in                                                           | No                                  |

## Getting started

```bash
# 1. Use the pinned Node version and enable pnpm
nvm use              # reads .nvmrc
corepack enable      # provides the pnpm version pinned in package.json

# 2. Install dependencies (also generates the Prisma client into src/generated/prisma)
pnpm install

# 3. Configure environment variables
cp .env.example .env
#   Minimum for local dev: DATABASE_URL, AUTH_SECRET (run `npx auth secret`), ADMIN_EMAILS.
#   Every variable is documented in .env.example and validated in src/lib/env.schema.ts.

# 4. Create the database schema and load sample data
pnpm db:migrate      # prisma migrate dev: applies prisma/migrations to your DATABASE_URL
pnpm db:seed         # products in every inventory status, swatches, portfolio, placeholder delivery zones, admin user

# 5. Run the app
pnpm dev             # http://localhost:3000
```

### Environment variables

`src/lib/env.ts` validates the environment at boot (it is imported by `next.config.ts`), so a
missing or malformed variable stops `next dev` / `next build` with a clear message.

- **Always required:** `DATABASE_URL`, `AUTH_SECRET`.
- **Required in production (and during `pnpm build`):** `AUTH_RESEND_KEY`,
  `BLOB_READ_WRITE_TOKEN`, `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`.
- **Optional / defaulted:** `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` (set both or neither),
  `CRON_SECRET` (v1.1), `DEPOSIT_PERCENT=50`, `REPAIR_WINDOW_DAYS=7`,
  `STUDIO_TIMEZONE=Africa/Lagos`, `DEFAULT_CURRENCY=NGN`, `MIN_LEAD_TIME_DAYS=14`.

### Signing in locally without Resend

If `AUTH_RESEND_KEY` is empty (development only), magic-link emails aren't sent. Instead the
sign-in link is printed in the `pnpm dev` terminal; open it in your browser to sign in. Production
requires a real Resend key.

### Image uploads

Custom-request reference images upload straight to Vercel Blob, using a token issued by
`/api/uploads`. Without `BLOB_READ_WRITE_TOKEN` the form still works but the uploader is disabled.
Create a Blob store in Vercel (Storage → Blob) and copy its read-write token into `.env`.

### Admin access

Admins are never created through the UI (US-E1). Put your email in `ADMIN_EMAILS`, then either run
`pnpm db:seed` or simply sign in: the role is granted on sign-in. Non-admins get a 404 on
`/admin/*` (D-4).

`pnpm test:e2e` starts its own dev server with `ADMIN_EMAILS` set to dedicated `e2e-admin-…`
accounts, so your own admin email isn't used by the tests.

### Delivery zones (launch blocker)

The seed creates delivery zones named **`PLACEHOLDER — …`** with made-up fees so delivery flows can
be built (D-12). Replace them with real zones and fees in `/admin/settings` before launch.

## Scripts

| Command                          | What it does                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                       | Start the dev server                                                                     |
| `pnpm build` / `pnpm start`      | Production build / serve it                                                              |
| `pnpm lint`                      | ESLint (Next.js core-web-vitals + TypeScript + Prettier-compat)                          |
| `pnpm typecheck`                 | Generate route types (`next typegen`) and run `tsc --noEmit`                             |
| `pnpm test`                      | Jest unit and component tests (`--coverage` enforces ≥ 90% lines on `src/lib/`)          |
| `pnpm test:integration`          | Jest integration tests: Server Actions and data layer against `DATABASE_URL` (migrated)  |
| `pnpm test:e2e`                  | Playwright E2E (starts `pnpm dev`; set `PLAYWRIGHT_BASE_URL` to test a deployed preview) |
| `pnpm format` / `format:check`   | Prettier write / check                                                                   |
| `pnpm db:migrate`                | `prisma migrate dev`: create or apply migrations locally                                 |
| `pnpm db:deploy`                 | `prisma migrate deploy`: apply migrations in CI/CD (forward-only)                        |
| `pnpm db:seed`                   | Run `prisma/seed.ts` (idempotent)                                                        |
| `pnpm db:validate`               | `prisma validate`                                                                        |
| `pnpm db:generate` / `db:studio` | Regenerate the Prisma client / open Prisma Studio                                        |

First Playwright run: `pnpm exec playwright install chromium`. To use a Chromium you already have,
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` instead. The E2E tests expect the seed data
(`pnpm db:seed`) and sign in through the dev magic-link fallback, so leave `AUTH_RESEND_KEY` empty
for local E2E runs.

## Project structure

```
prisma/
  schema.prisma          # full domain model from PRD §5 (money in *Kobo Int fields, NGN)
  migrations/            # forward-only SQL migrations
  seed.ts                # dev seed data
prisma.config.ts         # Prisma 7 config (datasource URL, migrations path, seed command)
src/
  app/
    (shop)/              # /, /shop, /shop/[slug], /checkout/[productId], /policies/terms
    (custom)/custom/     # /custom, gallery, request, request/success, book (v1.1)
    (account)/account/   # auth-guarded: wardrobe, wardrobe/[orderId], measurements, profile
    admin/               # admin-guarded (404 for non-admins): orders, clients, products, …
    api/                 # auth/[...nextauth], uploads, webhooks/paystack, cron/reminders (stubs)
    sign-in/             # minimal magic-link / Google sign-in
    not-found.tsx
  components/
    ui/                  # shadcn/ui primitives (button, input, card, badge)
    shop/ custom/ account/ admin/   # feature components (to come)
  lib/
    env.ts, env.schema.ts   # Zod-validated environment
    prisma.ts               # Prisma client singleton
    auth.ts, auth.config.ts # Auth.js v5 (full config / adapter-free config for the proxy)
    money.ts                # kobo ↔ NGN, en-NG formatting
    units.ts                # cm ↔ in
    inventory.ts            # deriveInventoryStatus (US-A1, D-2)
    custom-order/status.ts  # ALLOWED_TRANSITIONS, canTransition (gates), statusToProgress
    route-access.ts         # route protection rules + safe callbackUrl
    payments/ validators/   # (to come)
  server/
    auth/guards.ts       # requireUser(), requireAdmin()
    actions/ loaders/ custom/   # (to come)
  emails/                # React Email templates (to come)
  generated/prisma/      # generated Prisma client (git-ignored)
  types/next-auth.d.ts   # session.user.id / role augmentation
  proxy.ts               # route protection (Next.js 16's name for middleware.ts)
tests/
  unit/                  # Jest: pure functions and components
  integration/           # Jest against a test Postgres (to come)
  e2e/                   # Playwright
```

## Architecture notes

- **Next.js 16 `proxy.ts`.** Next.js 16 renamed `middleware.ts` to `proxy.ts`, and the PRD notes
  this. The proxy redirects signed-out visitors away from `/account/*`, `/custom/request`,
  `/custom/book` and `/checkout/*` (keeping `callbackUrl`), and returns 404 on `/admin/*` to
  anyone who is not an admin.
- **Sessions are JWTs**, so the proxy can authorise without a database call. The Prisma adapter
  still stores users, accounts and verification tokens. The session carries `user.id` and
  `user.role`.
- **Defence in depth: the layout guard is not enough on its own.** Next.js renders a page and
  its layouts in parallel, so a page's own output can reach the client even when the layout guard
  fails. Every admin page, loader and Server Action must call `requireAdmin()` itself, and every
  customer one `requireUser()`, before reading any data. (`requireAdmin()` re-reads the role from
  the database.) This matches PRD §9 rule 2.
- **Cache Components is on** (the Next.js 16 default). Anything that reads the request (session,
  cookies, `searchParams`) must sit behind `<Suspense>`. The guards call `await connection()`
  first.
- **Prisma 7** generates the client into `src/generated/prisma`. Import models from
  `@/generated/prisma/client` (server only) and enums from `@/generated/prisma/enums` (safe
  anywhere). Prisma 7 does not auto-load `.env`; `prisma.config.ts` does that.
- **Business rules are pure functions** in `src/lib/` with exhaustive unit tests (PRD §9 rule 3).

## CI

`.github/workflows/ci.yml` runs on every PR and every push to `main`: install, lint, format check,
typecheck, `prisma validate`, `prisma migrate deploy` plus seed against a Postgres 16 service, unit
tests with coverage, and `next build` with dummy environment variables. E2E against Vercel
previews comes later (PRD §11).
