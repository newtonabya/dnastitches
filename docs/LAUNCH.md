# Launch checklist

Everything to do once, in order, to take DNA Stitches live. Tick each box as you go.
The README explains each feature in more detail.

## 1. Database

- [ ] Create a **production** Postgres database (Neon or Supabase), separate from preview and
      development. On Neon, a separate branch per environment works well.
- [ ] Use the **direct (non-pooled)** connection string for `DATABASE_URL`. Migrations need a
      direct connection.
- [ ] Don't run `pnpm db:seed` against production. It adds sample products and placeholder
      delivery zones. Production starts empty: you add real content in step 6.

Migrations run automatically on every deploy: Vercel runs `pnpm vercel-build`, which applies
pending migrations to that environment's `DATABASE_URL` and then builds. That's why Preview must
never point at the production database.

## 2. Vercel project and environment variables

- [ ] Import the GitHub repository in Vercel. The production branch is `main`.
- [ ] In Vercel → Settings → Environment Variables, set these for **Production** (and Preview
      versions pointing at the preview database and test keys):

| Variable                                                 | Value                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | Production database, direct connection (step 1)                           |
| `AUTH_SECRET`                                            | `npx auth secret`, or `openssl rand -base64 32`                           |
| `ADMIN_EMAILS`                                           | Your admin email(s), comma-separated                                      |
| `NEXT_PUBLIC_SITE_URL`                                   | `https://<your-domain>` (no trailing slash)                               |
| `AUTH_RESEND_KEY`, `RESEND_API_KEY`                      | Resend API key (step 3); the same key works for both                      |
| `EMAIL_FROM`                                             | e.g. `DNA Stitches <hello@<your-domain>>`, on the verified domain         |
| `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack **live** keys for Production, **test** keys for Preview (step 4) |
| `BLOB_READ_WRITE_TOKEN`                                  | Vercel → Storage → Blob → your store → token                              |
| `CRON_SECRET`                                            | `openssl rand -hex 32`; keep it for step 5                                |
| `STUDIO_ADDRESS`, `STUDIO_HOURS`                         | Shown at checkout and in appointment emails                               |
| `STUDIO_TIMEZONE`                                        | `Africa/Lagos` (default)                                                  |
| `CONSULTATION_MINUTES`, `APPOINTMENTS_AUTO_CONFIRM`      | Optional: 60 and `false` by default                                       |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                   | Optional Google sign-in (set both or neither)                             |
| `SENDBOX_API_KEY`, `COURIER_ORIGIN_*`                    | Optional courier delivery (step 4b)                                       |

A missing required variable stops the build with a clear message.

- [ ] Add your domain in Vercel → Settings → Domains, and redeploy.

## 3. Email (Resend)

- [ ] Add and **verify your sending domain** in Resend (DNS records).
- [ ] Create an API key and set it as `AUTH_RESEND_KEY` and `RESEND_API_KEY`.
- [ ] Optional: Google sign-in. In Google Cloud, create OAuth credentials with the redirect URI
      `https://<your-domain>/api/auth/callback/google`.

## 4. Payments (Paystack)

- [ ] Complete Paystack business verification so live payments are enabled.
- [ ] Settings → API Keys & Webhooks: set the **webhook URL** to
      `https://<your-domain>/api/webhooks/paystack`. Use the same path on the preview domain with
      test keys.
- [ ] On a Preview deployment with **test** keys, buy a test piece and pay a test deposit with a
      Paystack test card. Check that the order shows as paid and the emails arrive.

The customer return URL is built from `NEXT_PUBLIC_SITE_URL`; there's nothing to set in Paystack
for it.

## 4b. Courier delivery (Sendbox, optional)

Skip this to keep flat delivery-zone fees and arrange couriers yourself.

- [ ] Create a [Sendbox](https://sendbox.co) business account and **fund your Sendbox wallet**.
      Bookings are paid from it; with too little, a shipment waits "on hold".
- [ ] On the Sendbox developer dashboard (developers.sendbox.co), create an app and copy its
      **access token**. Leave its webhook URL empty: the site sends its own with each booking.
- [ ] In Vercel, set `SENDBOX_API_KEY` to the token, plus the studio's pickup address:
      `COURIER_ORIGIN_STREET`, `COURIER_ORIGIN_CITY`, `COURIER_ORIGIN_STATE` (e.g. `Lagos`) and
      `COURIER_ORIGIN_PHONE` (e.g. `+2348012345678`). Optionally set `COURIER_PARCEL_WEIGHT_KG`
      (default 1). Redeploy.
- [ ] Check: at checkout, choosing delivery to a saved address shows a "Sendbox …" price.
- [ ] After a real delivery order, book the courier from Admin → Orders → Shop orders →
      Courier & tracking. Check the customer gets the "On its way" email. Tracking then
      updates every 15 minutes (step 5).

## 5. Scheduled jobs

- [ ] **Expired checkout holds:** `vercel.json` already schedules `/api/cron/release-reservations`
      daily. Vercel sends `CRON_SECRET` automatically.
- [ ] **Fitting and pickup reminders, and courier tracking:** in GitHub → Settings → Secrets and variables → Actions,
      add the **secret** `CRON_SECRET` (the same value as in Vercel) and the **variable**
      `SITE_URL` (`https://<your-domain>`).
- [ ] Run the **Reminders** workflow once by hand (Actions tab → Reminders → Run workflow). It
      should succeed and print `{"sent":0,…}` (and, for tracking, `{"checked":0,…}`).
- [ ] **Optional, text reminders:** create a [Termii](https://termii.com) account, fund it,
      register a sender ID, then set `TERMII_API_KEY` and `TERMII_SENDER_ID` in Vercel (and
      `TERMII_CHANNEL` if you want `generic` or `whatsapp` instead of `dnd`), and redeploy.
      Until then, customers who opt in still get the emails.

## 6. Content and settings (signed in as admin)

Sign in with an email from `ADMIN_EMAILS`. You get the Admin link on first sign-in.

- [ ] **Settings → Delivery zones:** add your real zones and flat fees. Until a zone covers a
      customer's state, only pickup is offered.
- [ ] **Settings → Booking hours:** add your weekly consultation hours, and block any holidays.
      Customers can't book until hours exist.
- [ ] **Swatches**, then **Products** (with photos, measurements, care), then **Portfolio**.
      Publish each when ready.
- [ ] Read **/policies/terms** and check that the wording matches how you work.

## 7. Smoke test on production

- [ ] Sign in by email (check the link arrives from your domain) and with Google if enabled.
- [ ] Shop: browse, open a piece, switch cm/in, join notify-me on a sold-out piece.
- [ ] Custom: submit a request with a photo; it appears in Admin → Orders.
- [ ] Book a consultation; confirm it in Admin → Appointments; the calendar invite arrives.
- [ ] Optional: a real small purchase. All sales are final, so use a piece you'll mark sold
      afterwards.

## Known limits at launch

- Rate limits (notify-me, sign-in emails) are kept per server instance, so they're best-effort
  on Vercel. Move them to a shared store if abuse appears (PRD D-18).
- No full Content-Security-Policy yet; framing is blocked and the other security headers are set
  (PRD D-21).
- On the Vercel Hobby plan, Vercel crons run at most daily. That's why reminders use GitHub
  Actions (PRD D-16).
