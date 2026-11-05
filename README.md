# DNA Stitches

> Tailored to your DNA.

A dual-purpose fashion platform: a curated shop for 1-of-1 ready-to-wear pieces and an end-to-end
custom tailoring journey, run from an admin CRM. **[`PRD.md`](./PRD.md) is the single source of
truth** for product behaviour, data model and architecture.

**Status:** The MVP (v1.0) and v1.1 are complete.

- **Customer side:** sign-in and profile (US-E1); the shop gallery, product detail and notify-me (US-A1, A2, D2); the custom journey (US-A3, B1, B2, B3); Paystack checkout for ready-to-wear (US-A4); online deposits and balances (US-C4); My Wardrobe (US-D1); defect repair requests (US-D3); booking consultations (US-F1); fitting and pickup reminder emails (US-G1); reviews (US-H1).
- **Admin side:** the order pipeline and order detail (US-C1), client profiles (US-C2), catalog management (US-C3), the notify-me CSV export (US-D2), delivery zones (D-12), quotes and offline payments (US-C4), shop orders, repair requests (US-D3), appointments with booking hours (US-F2), and review approval (US-H1).

v1.2 so far: restock emails (US-D4) and SMS/WhatsApp reminders (US-G2). Still on the roadmap (`PRD.md` §4): an analytics dashboard and a courier integration.

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
  `CRON_SECRET`, `STUDIO_ADDRESS` and `STUDIO_HOURS` (shown at checkout for pickup),
  `CONSULTATION_MINUTES=60`, `APPOINTMENTS_AUTO_CONFIRM=false`, `TERMII_API_KEY` +
  `TERMII_SENDER_ID` (set both or neither) and `TERMII_CHANNEL=dnd`,
  `DEPOSIT_PERCENT=50`, `REPAIR_WINDOW_DAYS=7`, `STUDIO_TIMEZONE=Africa/Lagos`,
  `DEFAULT_CURRENCY=NGN`, `MIN_LEAD_TIME_DAYS=14`.

### Signing in locally without Resend

If `AUTH_RESEND_KEY` is empty (development only), magic-link emails aren't sent. Instead the
sign-in link is printed in the `pnpm dev` terminal; open it in your browser to sign in. Production
requires a real Resend key.

### Payments (Paystack)

Ready-to-wear checkout and custom-order deposits and balances go through Paystack in NGN.

- **Local dev without Paystack:** leave `PAYSTACK_SECRET_KEY` empty and payments use a built-in
  dev gateway at `/dev/paystack`, with "Simulate successful payment" and "Cancel payment"
  buttons. Nothing is charged. The dev gateway is disabled in production and whenever a key is set.
- **With Paystack test keys:** set `PAYSTACK_SECRET_KEY=sk_test_…` and
  `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_…`. In the Paystack dashboard (Settings → API Keys &
  Webhooks) set the webhook URL to `https://<your-domain>/api/webhooks/paystack`. Customers return
  to `/api/payments/callback`, built from `NEXT_PUBLIC_SITE_URL`.
- **How it's made safe:** the webhook checks the `x-paystack-signature` HMAC and then re-verifies
  the transaction with Paystack's Verify API before changing anything. Applying a payment is
  idempotent per reference, so the callback and the webhook can both arrive safely.
- **1-of-1 holds:** starting checkout holds the piece for 15 minutes (a pending order). Stock only
  goes down when the payment succeeds. Expired holds are released whenever anyone starts a
  checkout, and by a daily cron (`/api/cron/release-reservations`, scheduled in `vercel.json`,
  authorised with `Authorization: Bearer $CRON_SECRET`; the Vercel Hobby plan allows daily crons
  only).

### Consultations and appointments

Customers book a consultation (in the studio or by video) at `/custom/book` and manage it at
`/account/appointments`. Slots come from the weekly **booking hours** and **blocked dates** in
`/admin/settings` (the seed adds starter hours, Tuesday–Saturday 10:00–16:00, only if none
exist). Slots are `CONSULTATION_MINUTES` long (default 60), start at least 24 hours ahead and run
30 days out, all in `STUDIO_TIMEZONE`. Customers can cancel or move a booking up to 24 hours
before. Set `APPOINTMENTS_AUTO_CONFIRM=true` to confirm bookings instantly; otherwise you confirm
them in `/admin/appointments` (week and list views), where you can also reschedule to any free
time and mark appointments completed or no-show. Book fittings and pickups for a custom order from
its admin page. Every booking, change and cancellation emails a calendar invite (`.ics`); the
owner is emailed when a customer books, moves or cancels.

### Fitting and pickup reminders

Fittings and pickups get reminder emails **48 hours** and **3 hours** before they start
(US-G1). Reminders are created when you book or move the appointment and removed if it's
cancelled; each appointment's admin page shows their state. `/api/cron/reminders` sends whatever is
due. It's protected by `CRON_SECRET`, safe to call repeatedly (each reminder is sent at most once),
catches up on anything overdue, and retries a failed email on later runs (up to 4 attempts).

Something has to call it every 15 minutes. Pick one:

- **GitHub Actions (free, set up in this repo):** `.github/workflows/reminders.yml` runs every 15
  minutes. In GitHub → Settings → Secrets and variables → Actions, add a **secret**
  `CRON_SECRET` (the same value as in Vercel) and a **variable** `SITE_URL` (your production URL).
  Until both exist, the workflow does nothing. GitHub may start scheduled runs a few minutes late.
- **Vercel Cron (Pro plan):** add `{ "path": "/api/cron/reminders", "schedule": "*/15 * * * *" }`
  to `crons` in `vercel.json`. The Hobby plan only allows daily crons, which is too rare for the
  3-hour reminder.

### Text reminders (SMS / WhatsApp)

Customers can tick **Text me reminders before fittings and pickups** on their profile (this needs
a phone number). They then also get a short text 48 hours and 3 hours before each fitting or
pickup, alongside the emails, through the same at-most-once reminder job. Turning it off removes
any pending texts. Texts go through [Termii](https://termii.com) (Nigeria):

1. Create a Termii account, fund it, and register a **sender ID** (e.g. `DNAStitches`). The DND
   route needs the sender ID approved.
2. In Vercel, set `TERMII_API_KEY`, `TERMII_SENDER_ID` and, optionally, `TERMII_CHANNEL`: `dnd`
   (default; reaches numbers on Do-Not-Disturb), `generic`, or `whatsapp` (after setting up
   WhatsApp in Termii).

Without a key, texts are printed in the `pnpm dev` terminal in development and skipped in
production. Each reminder's admin page shows why ("text messages aren't set up").

### Restock emails

When a sold-out piece is back in stock and published, saving it in `/admin/products` emails
everyone who asked to hear about a restock (notify-me), once each. The save message says how many
people are being emailed, and the product page shows when each request was emailed. A failed email
is retried the next time you save. "Similar fabric" requests aren't emailed automatically: export
them as CSV and follow up yourself.

### Reviews

Customers can review a shop order once it's marked picked up or delivered, and a custom order once
it's completed: 1–5 stars, some text, and the name to show (the default is first name and last
initial, and the email address is never shown). Each order can be reviewed once. Reviews stay
hidden until you approve them at `/admin/reviews`, which also lets you hide a published one;
you're emailed about each new review. Approved reviews appear on the product page, and 4–5 star
ones as testimonials on the home page. Testimonials for custom pieces say "custom piece" rather
than the customer's private request title.

### Defect repairs

All sales are final (D-11). Instead of refunds, a customer can report a manufacturing defect from
My Wardrobe for `REPAIR_WINDOW_DAYS` (default 7) after handover: when a shop order is marked picked
up or delivered, or a custom order is completed. The owner handles reports at `/admin/repairs`
(Received → In repair → Repaired, or Not covered with a reason the customer sees). The customer is
emailed at every step. Repairs never create a payment or refund. The policy is published at
`/policies/terms`.

### Image uploads

Custom-request reference images and defect photos upload straight to Vercel Blob, using a token issued by
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
be built (D-12). Replace them with real zones and fees in **`/admin/settings`** before launch:
edit or deactivate each placeholder and add your own. Until you do, the settings page shows a
warning.

## Scripts

| Command                          | What it does                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                       | Start the dev server                                                                     |
| `pnpm build` / `pnpm start`      | Production build / serve it                                                              |
| `pnpm vercel-build`              | What Vercel runs on deploy: `prisma migrate deploy`, then `next build`                   |
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
for local E2E runs. Payments run through the dev gateway (the E2E server clears
`PAYSTACK_SECRET_KEY`). Before each local run, products left over from earlier runs (slugs starting
`e2e-`) are unpublished so the shop's first page stays predictable.

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
    api/                 # auth, uploads, payments/callback, webhooks/paystack, cron/*
    sign-in/             # minimal magic-link / Google sign-in
    not-found.tsx
  components/
    ui/                  # shadcn/ui primitives (button, input, card, badge)
    shop/ custom/ account/ admin/   # feature components
  lib/
    env.ts, env.schema.ts   # Zod-validated environment
    prisma.ts               # Prisma client singleton
    auth.ts, auth.config.ts # Auth.js v5 (full config / adapter-free config for the proxy)
    money.ts                # kobo ↔ NGN, en-NG formatting
    units.ts                # cm ↔ in
    inventory.ts            # deriveInventoryStatus (US-A1, D-2)
    custom-order/status.ts  # ALLOWED_TRANSITIONS, canTransition (gates), statusToProgress
    route-access.ts         # route protection rules + safe callbackUrl
    payments/               # Paystack client, webhook signature, payment references
    validators/             # Zod schemas shared by forms and Server Actions
  server/
    auth/guards.ts       # requireUser(), requireAdmin()
    actions/             # Server Actions (customer and admin/)
    data/                # plain Prisma queries and mutations (integration-tested)
    loaders/             # cached reads for pages
    payments/            # provider selection, payment processing, payment emails
  emails/                # email templates
  generated/prisma/      # generated Prisma client (git-ignored)
  types/next-auth.d.ts   # session.user.id / role augmentation
  proxy.ts               # route protection (Next.js 16's name for middleware.ts)
tests/
  unit/                  # Jest: pure functions and components
  integration/           # Jest against a test Postgres
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

`.github/workflows/ci.yml` runs on every PR and every push to `main`, as two jobs:

- **Lint, typecheck, test, build:** install, lint, format check, typecheck, `prisma validate`,
  `prisma migrate deploy` plus seed against a Postgres 16 service, unit tests with coverage,
  integration tests, and `next build` with dummy environment variables.
- **End-to-end (Playwright):** a fresh Postgres, migrations and seed, then every E2E test on
  desktop and mobile Chrome with axe accessibility checks. It signs in through the dev magic-link
  fallback and pays through the dev gateway, so nothing leaves the runner. When it fails, the
  Playwright report is attached to the run.

`.github/workflows/reminders.yml` calls the reminders endpoint every 15 minutes (see
[Fitting and pickup reminders](#fitting-and-pickup-reminders)).

## Deploying

See [`docs/LAUNCH.md`](./docs/LAUNCH.md) for the full go-live checklist. On Vercel, the
`vercel-build` script applies pending migrations to that environment's `DATABASE_URL` before
building, so give **Preview** and **Production** separate databases (for example Neon branches).
