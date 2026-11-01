# DNA Stitches — Product Requirements Document (PRD)

> **Status:** v1.0 — Draft for review
> **Owner:** Newton Abya
> **Last updated:** 2026-11-01
> **Source of truth:** This file is the canonical spec for all implementation work (human or AI-assisted). If code and this document disagree, the document wins until it is amended via a reviewed commit.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals, Non-Goals & Success Metrics](#2-goals-non-goals--success-metrics)
3. [Personas & Roles](#3-personas--roles)
4. [Scope & Release Plan](#4-scope--release-plan)
5. [Domain Model](#5-domain-model)
6. [Functional Requirements (Epics & User Stories)](#6-functional-requirements-epics--user-stories)
7. [Route Map](#7-route-map)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Technical Constraints & Stack](#9-technical-constraints--stack)
10. [File / Folder Structure](#10-file--folder-structure)
11. [Testing Strategy](#11-testing-strategy)
12. [Global Definition of Done](#12-global-definition-of-done)
13. [Open Questions & Decisions Log](#13-open-questions--decisions-log)
14. [Glossary](#14-glossary)
15. [Reference Documentation](#15-reference-documentation)

---

## 1. Project Overview

| Field | Value |
|---|---|
| **App name** | DNA Stitches |
| **Tagline** | "Tailored to your DNA." |
| **Elevator pitch** | A dual-purpose fashion platform: a curated shop for 1-of-1 ready-to-wear pieces, and an end-to-end custom tailoring journey. The owner runs the business from an admin CRM; the client buys, requests custom work, and tracks progress from a personal portal. |
| **Killer feature** | **Sold-out → custom lead.** Every sold-out piece becomes a conversion point: "Request Custom Version" pre-fills a custom order using that piece as the reference design. |
| **Platforms** | Responsive web (mobile-first). No native apps in scope. |

### Core Entities

`User` (Customer / Admin), `Product` (Ready-to-Wear), `ProductImage`, `Order` (RTW purchase), `CustomOrder`, `CustomOrderStatusLog`, `MeasurementProfile`, `FabricSwatch`, `PortfolioItem`, `Appointment`, `Review`, `NotificationRequest`, `Reminder`.

---

## 2. Goals, Non-Goals & Success Metrics

### Goals
- **G1.** Sell 1-of-1 ready-to-wear pieces online with honest, real-time availability.
- **G2.** Convert sold-out and portfolio interest into qualified custom-order leads.
- **G3.** Replace the owner's spreadsheets/WhatsApp threads with a single CRM for custom orders and client measurements.
- **G4.** Give customers transparency into custom-order progress, reducing "where is my dress?" messages.

### Non-Goals (v1)
- Multi-vendor marketplace or multiple tailors/staff accounts with granular permissions.
- Native mobile apps.
- Virtual try-on / 3D body scanning.
- Multi-currency and international tax calculation (single currency, see [OQ-3](#13-open-questions--decisions-log)).
- Full inventory management for multi-unit SKUs (pieces are 1-of-1 by design; see [D-2](#13-open-questions--decisions-log)).

### Success Metrics (measured 90 days post-launch)
| Metric | Target |
|---|---|
| Sold-out page → custom request conversion | ≥ 5% |
| Portfolio "I want something like this" → submitted request | ≥ 10% |
| Custom requests with a saved, reusable MeasurementProfile | ≥ 80% |
| Inbound "status update?" messages to owner (self-reported) | −50% vs. baseline |
| Lighthouse Performance score on shop pages (mobile) | ≥ 90 |

---

## 3. Personas & Roles

| Persona | Role enum | Description | Key needs |
|---|---|---|---|
| **Visitor** | _(unauthenticated)_ | Browses shop & gallery. | Fast browsing, clear availability, low-friction sign-up. |
| **Customer** | `CUSTOMER` | Registered buyer and/or custom client. | Buy RTW, request custom pieces, store measurements, track progress, book consultations. |
| **Owner / Admin** | `ADMIN` | Designer-owner running the atelier. | Manage products, triage requests, move orders through pipeline, see full client history. |

### Authorization Matrix

| Capability | Visitor | Customer | Admin |
|---|:-:|:-:|:-:|
| Browse shop, gallery, product details | ✅ | ✅ | ✅ |
| Join restock/notify list (email only) | ✅ | ✅ | ✅ |
| Purchase RTW product | ❌ (must sign in) | ✅ | ✅ |
| Submit custom order request | ❌ (must sign in) | ✅ | ✅ |
| View / edit **own** measurements, orders, appointments | — | ✅ | ✅ |
| View **any** client's data | ❌ | ❌ | ✅ |
| Manage products, swatches, portfolio, pipeline | ❌ | ❌ | ✅ |

> **Rule:** Authorization is enforced **server-side** in every Server Action and Route Handler. UI hiding is cosmetic only.

---

## 4. Scope & Release Plan

| Release | Contents | Epics |
|---|---|---|
| **MVP (v1.0)** | Auth, RTW shop (browse, detail, checkout), sold-out → custom upsell, custom request form with uploads, swatches & measurements, admin pipeline + client profile, My Wardrobe progress, notify-me list. | A, B, C, D, E (core) |
| **v1.1** | Consultation scheduler, automated fitting reminders (email), reviews. | F, G, H |
| **v1.2+** | SMS/WhatsApp reminders, deposits for custom orders, analytics dashboard, restock auto-notify. | — |

Each user story below is tagged **[MVP]**, **[v1.1]**, or **[v1.2]**.

---

## 5. Domain Model

This is the **intended** Prisma model. Field names are normative; minor additions are allowed if documented in a PR.

### 5.1 Enums

```prisma
enum Role {
  CUSTOMER
  ADMIN
}

enum InventoryStatus {
  AVAILABLE
  LOW_STOCK   // see D-2: means "reserved/held" or last size for rare multi-unit drops
  SOLD_OUT
}

enum CustomOrderStatus {
  REQUEST_RECEIVED        // submitted by customer, not yet triaged
  CONSULTATION_PENDING
  MEASUREMENTS_TAKEN
  IN_PRODUCTION
  FITTING
  READY_FOR_PICKUP
  COMPLETED               // collected / delivered
  CANCELLED
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  FULFILLED
  CANCELLED
  REFUNDED
}

enum AppointmentType {
  CONSULTATION
  MEASUREMENT
  FITTING
  PICKUP
}

enum AppointmentStatus {
  REQUESTED
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum MeasurementUnit {
  CM
  IN
}

enum NotificationRequestType {
  RESTOCK
  SIMILAR_FABRIC
}
```

### 5.2 Entities (summary)

| Entity | Key fields | Relations / notes |
|---|---|---|
| **User** | `id`, `email` (unique), `name`, `phone?`, `role` (default `CUSTOMER`), `image?`, timestamps | Auth.js `Account`, `Session`, `VerificationToken` tables included via adapter. |
| **Product** | `id`, `slug` (unique), `name`, `description`, `priceCents` (Int), `currency`, `inventoryStatus`, `quantity` (Int, default 1), `bustCm`, `waistCm`, `hipsCm`, `lengthCm` (Decimal), `sizeLabel?`, `fabricComposition`, `careInstructions`, `isPublished`, timestamps | `images ProductImage[]`, `fabricSwatch FabricSwatch?`. `inventoryStatus` is derived from `quantity` on write (see US-A1). |
| **ProductImage** | `id`, `productId`, `url`, `alt`, `sortOrder` | |
| **Order** | `id`, `userId`, `productId`, `amountCents`, `status`, `paymentRef?`, timestamps | One product per order in v1 (1-of-1 pieces). |
| **FabricSwatch** | `id`, `name`, `colorHex`, `imageUrl`, `composition`, `isAvailable`, `sortOrder` | |
| **PortfolioItem** | `id`, `title`, `description`, `imageUrl`, `tags String[]`, `isPublished`, `sourceProductId?` | `id` is the **referenceId** used to pre-fill custom requests (US-B2). |
| **MeasurementProfile** | `id`, `userId`, `label` (e.g. "Wedding 2026"), `unit`, `bust`, `waist`, `hips`, `shoulder?`, `armLength?`, `inseam?`, `height?`, `notes?`, `takenBy` (`SELF`\|`ADMIN`), `isDefault`, timestamps | A user may have many; exactly zero or one `isDefault = true`. Profiles are **versioned by creation** — edits create a new row so history is preserved (US-C2). |
| **CustomOrder** | `id`, `reference` (human-readable, e.g. `DNA-2026-0042`), `userId`, `status`, `title`, `description`, `occasion?`, `targetDate?`, `budgetCents?`, `referenceImageUrls String[]`, `portfolioItemId?`, `sourceProductId?`, `fabricSwatchId?`, `measurementProfileId?`, `quotedPriceCents?`, `adminNotes?` (private), timestamps | `statusLogs CustomOrderStatusLog[]`, `appointments Appointment[]`. |
| **CustomOrderStatusLog** | `id`, `customOrderId`, `fromStatus?`, `toStatus`, `changedById`, `note?`, `createdAt` | Append-only audit trail. |
| **Appointment** | `id`, `userId`, `customOrderId?`, `type`, `status`, `startsAt`, `endsAt`, `notes?` | [v1.1] |
| **Reminder** | `id`, `appointmentId`, `channel` (`EMAIL`), `sendAt`, `sentAt?`, `error?` | [v1.1] Processed by a scheduled job. |
| **Review** | `id`, `userId`, `productId?`, `customOrderId?`, `rating` (1–5), `body`, `isApproved`, `createdAt` | [v1.1] Exactly one of `productId`/`customOrderId` must be set. |
| **NotificationRequest** | `id`, `email`, `userId?`, `productId?`, `type`, `createdAt`, `notifiedAt?` | Unique on (`email`, `productId`, `type`). |

### 5.3 Data Rules
- **Money** is stored as integer minor units (`*Cents`). Never floats.
- **Measurements** are stored in the unit the user entered plus `unit`; display conversion happens in the UI layer via a shared helper in `src/lib/units.ts`.
- **Soft vs hard delete:** Products and portfolio items are unpublished (`isPublished = false`), never hard-deleted, so historical orders keep their references.
- All tables have `createdAt` / `updatedAt` unless append-only.

---

## 6. Functional Requirements (Epics & User Stories)

**Format.** Each story lists **Acceptance Criteria (AC)** in Given/When/Then form — these are what tests assert — and a **Definition of Done (DoD)** — the implementation checklist. A story is done only when all AC pass *and* all DoD items are checked *and* the [Global DoD](#12-global-definition-of-done) is satisfied.

---

### Epic A — Ready-to-Wear Shop

#### US-A1 · Browse gallery with availability cues **[MVP]**
> As a **visitor/customer**, I can browse a gallery of finished pieces and immediately see whether each is Available, Low Stock, or Sold Out.

**Acceptance Criteria**
1. Given published products exist, when I visit `/shop`, then I see a responsive grid (1 col mobile, 2 tablet, 3–4 desktop) of product cards with image, name, price, and status badge.
2. Given a product is `AVAILABLE`, then no status badge is shown (or a subtle "Available" badge) and the image is full color.
3. Given a product is `LOW_STOCK`, then a "Last One" / "Low Stock" badge is shown in an accent color.
4. Given a product is `SOLD_OUT`, then the card image renders with a greyscale filter + translucent overlay and a "1-of-1 · Sold" badge.
5. Given unpublished products exist, then they never appear on `/shop`.
6. I can filter by status (All / Available / Sold Out) via query string (`?status=available`) and the filter persists on refresh.

**Definition of Done**
- [ ] Prisma `InventoryStatus` enum and `Product.inventoryStatus` field exist with a migration.
- [ ] A single pure function `deriveInventoryStatus(quantity, lowStockThreshold)` lives in `src/lib/inventory.ts` and is unit-tested; product writes use it.
- [ ] `<ProductCard>` and `<StatusBadge>` components in `src/components/shop/` with RTL tests for all three states.
- [ ] `/shop` is a Server Component; data fetched with Prisma, paginated (24 per page).
- [ ] Seed script creates ≥ 3 products in each status.

#### US-A2 · Product detail with measurements & care **[MVP]**
> As a **customer**, I can view detailed garment measurements and fabric care for each 1-of-1 piece.

**Acceptance Criteria**
1. Given I open `/shop/[slug]`, then I see an image gallery, name, price, status, description, and a spec table with **Bust, Waist, Hips, Length** (and size label if present).
2. I can toggle the spec table between cm and inches; the choice persists for the session.
3. Fabric composition and care instructions are displayed in their own section.
4. Given the slug does not exist or the product is unpublished, then a 404 page is shown.
5. Page has correct `<title>`, meta description, and Open Graph image from the product's first image.

**Definition of Done**
- [ ] `<SpecTable>` component with unit toggle, tested for conversion accuracy (±0.1).
- [ ] `generateMetadata` implemented for the route.
- [ ] `notFound()` used for missing/unpublished products; covered by a test.

#### US-A3 · Sold-out → "Request Custom Version" upsell **[MVP]** ⭐
> As a **customer** viewing a sold-out piece, I can request a custom version of it in one click.

**Acceptance Criteria**
1. Given a product is `SOLD_OUT`, when I open its detail page, then the "Add to Bag/Buy" button is replaced by a primary **"Request Custom Version"** button and a secondary "Notify me" control (US-D2).
2. When I click "Request Custom Version" while signed out, then I am sent to sign-in and returned to the pre-filled form afterward (`callbackUrl` preserved).
3. When I click it while signed in, then I land on `/custom/request?fromProduct=<productId>` with the product's primary image attached as a reference image, the title pre-filled as "Custom version of <name>", and the product's fabric swatch pre-selected (if any).
4. The submitted `CustomOrder` records `sourceProductId` so the admin sees the lead's origin.

**Definition of Done**
- [ ] Shared pre-fill resolver `resolveCustomRequestPrefill({ fromProduct?, fromPortfolio? })` in `src/server/custom/prefill.ts`, unit-tested for both sources and for invalid IDs (falls back to empty form, no crash).
- [ ] E2E test: sold-out product → sign in → pre-filled form → submit → order appears in admin with source product.

#### US-A4 · Purchase an available piece **[MVP]**
> As a **customer**, I can buy an available 1-of-1 piece.

**Acceptance Criteria**
1. Given a product is `AVAILABLE` or `LOW_STOCK`, I can click "Buy Now" and complete checkout via the payment provider ([OQ-1](#13-open-questions--decisions-log)).
2. Given two customers attempt to buy the last unit concurrently, then exactly one succeeds; the other sees "This piece was just claimed" and is offered "Request Custom Version".
3. On successful payment, `quantity` decrements, `inventoryStatus` is re-derived (typically → `SOLD_OUT`), an `Order` with `PAID` is created, and a confirmation email is sent.
4. If payment is abandoned, any reservation is released after 15 minutes.

**Definition of Done**
- [ ] Stock decrement happens inside a Prisma `$transaction` with a conditional update (`WHERE quantity > 0`) — no read-then-write race.
- [ ] Payment webhook handler in `src/app/api/webhooks/payments/route.ts` verifies signature and is idempotent (same event twice ⇒ one order).
- [ ] Integration test simulating concurrent purchase.

---

### Epic B — The Custom Journey

#### US-B1 · Submit a custom design request **[MVP]**
> As a **customer**, I can submit a design request with reference images, a fabric swatch, and my measurements.

**Acceptance Criteria**
1. The form at `/custom/request` is a multi-step flow: **(1) Design** — title, description, occasion, target date, budget (optional), up to 5 reference images; **(2) Fabric** — visual swatch grid, single select, or "Not sure — advise me"; **(3) Measurements** — pick a saved profile, enter new, or "Book a measurement appointment instead"; **(4) Review & submit**.
2. Images: JPEG/PNG/WebP/HEIC only, ≤ 8 MB each, ≤ 5 files. Invalid files show an inline error and are not uploaded.
3. Validation errors are shown inline per field, both client-side (instant) and server-side (authoritative). The same Zod schema is used for both.
4. Target date, if given, must be ≥ 14 days in the future (configurable `MIN_LEAD_TIME_DAYS`).
5. New measurements entered in step 3 are saved as a `MeasurementProfile` linked to my user and available for reuse next time.
6. On submit, a `CustomOrder` is created with status `REQUEST_RECEIVED`, a human-readable reference (e.g. `DNA-2026-0042`) is shown on a confirmation screen, and both I and the owner receive an email.
7. Draft progress is preserved if I navigate between steps (client state); a page refresh may lose unsaved steps (acceptable for MVP).

**Definition of Done**
- [ ] Zod schemas `customOrderRequestSchema` and `measurementProfileSchema` in `src/lib/validators/`, with unit tests for every rule above.
- [ ] Server Action `submitCustomOrder` in `src/server/actions/custom-order.ts`: checks auth, re-validates with Zod, creates profile + order in one transaction, returns typed `{ ok: true, reference } | { ok: false, fieldErrors }`.
- [ ] Image upload via **Vercel Blob** client uploads with a server-issued token; token route enforces type/size limits and auth.
- [ ] `<SwatchGrid>` component is keyboard-navigable (arrow keys + Enter) and announces selection to screen readers.
- [ ] Reference generator is collision-safe (DB sequence or unique constraint + retry).

#### US-B2 · "I want something like this" from the portfolio **[MVP]**
> As a **customer**, I can click "I want something like this" on a portfolio image to start a pre-filled request.

**Acceptance Criteria**
1. `/custom/gallery` shows published `PortfolioItem`s in a masonry/grid with tag filters.
2. Each item has an **"I want something like this"** button linking to `/custom/request?fromPortfolio=<portfolioItemId>`.
3. The form pre-fills: reference image = portfolio image, title = "Inspired by <title>"; the customer can still edit or remove anything.
4. The created `CustomOrder` stores `portfolioItemId`.
5. An invalid or unpublished `fromPortfolio` ID results in an empty form plus a dismissible notice — never an error page.

**Definition of Done**
- [ ] Uses the shared `resolveCustomRequestPrefill` from US-A3.
- [ ] Component test for pre-filled state; unit test for invalid ID fallback.

#### US-B3 · Manage my measurement profiles **[MVP]**
> As a **customer**, I can view, add, and set a default measurement profile.

**Acceptance Criteria**
1. `/account/measurements` lists my profiles with label, date, unit, and who took them (Self / Atelier).
2. I can add a new profile and mark one as default; setting a new default unsets the previous one.
3. "Editing" a profile creates a new version; previous versions remain visible to the admin.
4. Each field shows a "How to measure" helper (text + illustration).
5. Values outside plausible human ranges (e.g. waist < 40 cm or > 200 cm) are rejected with a friendly message.

**Definition of Done**
- [ ] Default uniqueness enforced in a transaction (and covered by a test).
- [ ] Plausibility ranges defined once in `src/lib/validators/measurements.ts`.

---

### Epic C — Admin & CRM

#### US-C1 · Move custom orders through the pipeline **[MVP]**
> As the **owner**, I can update a custom order's status through the pipeline.

**Pipeline**
```
REQUEST_RECEIVED → CONSULTATION_PENDING → MEASUREMENTS_TAKEN → IN_PRODUCTION → FITTING → READY_FOR_PICKUP → COMPLETED
                                     (any non-terminal state) → CANCELLED
                                               FITTING → IN_PRODUCTION   (alterations loop)
```

**Acceptance Criteria**
1. `/admin/orders` shows a Kanban board with one column per non-terminal status; `COMPLETED`/`CANCELLED` are in a filterable list view.
2. I can move a card via drag-and-drop **or** via a status `<select>` on the order detail page (accessible fallback).
3. Only transitions in the diagram above are allowed; invalid moves are rejected server-side with a clear message and the card snaps back.
4. Every transition writes a `CustomOrderStatusLog` row with from, to, admin, timestamp, and optional note.
5. The order detail page `/admin/orders/[id]` shows the full status timeline, reference images, fabric, linked measurement profile, source (product/portfolio), and private admin notes.
6. Customer receives an email on transitions to `MEASUREMENTS_TAKEN`, `IN_PRODUCTION`, `FITTING`, and `READY_FOR_PICKUP`.
7. Optimistic UI updates roll back if the server rejects the transition.

**Definition of Done**
- [ ] Transition table `ALLOWED_TRANSITIONS` + `canTransition(from, to)` in `src/lib/custom-order/status.ts`, exhaustively unit-tested (every from×to pair).
- [ ] Server Action `updateCustomOrderStatus` checks `ADMIN` role, validates transition, and updates order + log atomically.
- [ ] Drag-and-drop library is accessible (e.g. `@dnd-kit` with keyboard sensor).

#### US-C2 · Client Profile view **[MVP]**
> As the **owner**, I can see a customer's measurement history and all past orders in one place.

**Acceptance Criteria**
1. `/admin/clients` lists customers with search by name/email/phone and shows count of custom orders and last activity.
2. `/admin/clients/[id]` aggregates: contact info; all `MeasurementProfile` versions (newest first, with diff highlighting vs previous); all `CustomOrder`s with status; all RTW `Order`s; appointments; notify-me requests.
3. I can record a new measurement profile on behalf of the client (`takenBy = ADMIN`).
4. Non-admin users requesting any `/admin/*` route receive a 404 (not 403, to avoid revealing the route).

**Definition of Done**
- [ ] Single server-side data loader `getClientProfile(userId)` with one round trip per relation (no N+1), covered by an integration test against a seeded DB.
- [ ] Admin guard implemented once in `src/app/admin/layout.tsx` **and** re-checked in every admin Server Action.

#### US-C3 · Manage catalog content **[MVP]**
> As the **owner**, I can create, edit, publish/unpublish products, fabric swatches, and portfolio items.

**Acceptance Criteria**
1. CRUD forms at `/admin/products`, `/admin/swatches`, `/admin/portfolio` with image upload, reordering of product images, and a publish toggle.
2. Manually marking a product `SOLD_OUT` (e.g. sold in person) is supported and sets `quantity = 0`.
3. Slugs are auto-generated from name and unique; editing the name does not change an existing slug unless explicitly requested.

**Definition of Done**
- [ ] All forms use shared Zod schemas; all mutations via admin-guarded Server Actions.
- [ ] `revalidatePath` called for affected public routes after mutations.

---

### Epic D — Engagement & Accounts

#### US-D1 · "My Wardrobe" progress portal **[MVP]**
> As a **customer**, I can see my custom order progress in a "My Wardrobe" portal.

**Acceptance Criteria**
1. `/account/wardrobe` lists my custom orders (active first) and RTW purchases.
2. Each active custom order shows a progress bar and percentage using this fixed mapping:

   | Status | Progress |
   |---|---|
   | `REQUEST_RECEIVED` | 5% |
   | `CONSULTATION_PENDING` | 15% |
   | `MEASUREMENTS_TAKEN` | 30% |
   | `IN_PRODUCTION` | 55% |
   | `FITTING` | 80% |
   | `READY_FOR_PICKUP` | 95% |
   | `COMPLETED` | 100% |
   | `CANCELLED` | — (shown as "Cancelled", no bar) |

3. Each order shows a customer-friendly timeline of status changes (admin notes are **never** shown).
4. I can only ever see my own orders; requesting another user's order ID returns 404.

**Definition of Done**
- [ ] `statusToProgress(status)` in `src/lib/custom-order/status.ts`, unit-tested for every enum value (test fails if a new enum value is added without a mapping).
- [ ] Query scoped by `userId = session.user.id` at the data layer, with a test proving cross-user access is denied.

#### US-D2 · Notify me (restock / similar fabric) **[MVP]**
> As a **visitor or customer**, I can ask to be notified if a sold-out style returns or a similar fabric becomes available.

**Acceptance Criteria**
1. Sold-out product pages show an email input (pre-filled if signed in) with two checkboxes: "Restock / similar piece" and "Similar fabric".
2. Submitting writes one `NotificationRequest` per selected type; duplicate submissions are idempotent and show the same success message.
3. Invalid email shows an inline error. Endpoint is rate-limited (5 requests / IP / 10 min).
4. Admin can view and export (CSV) notify-me requests per product from the admin product page.

**Definition of Done**
- [ ] Zod `notificationRequestSchema`; Server Action `createNotificationRequest` with upsert on the unique key.
- [ ] Rate limiter abstraction in `src/lib/rate-limit.ts` (in-memory for dev, Upstash/Vercel KV in prod).
- [ ] Auto-sending restock emails is **out of scope** for MVP (v1.2).

---

### Epic E — Authentication & Accounts

#### US-E1 · Sign up / sign in **[MVP]**
> As a **visitor**, I can create an account and sign in.

**Acceptance Criteria**
1. Sign-in options: email magic link and Google OAuth.
2. New users get `role = CUSTOMER`. The first admin is assigned via seed/env (`ADMIN_EMAILS`), never via UI.
3. `callbackUrl` is honored after sign-in, restricted to same-origin paths.
4. Signed-in users can update name and phone at `/account/profile`.

**Definition of Done**
- [ ] Auth.js v5 config in `src/lib/auth.ts` with Prisma adapter; `role` exposed on the session via callbacks and typed via module augmentation.
- [ ] Middleware protects `/account/*`, `/admin/*`, and `/custom/request`.
- [ ] E2E test: sign in → land on callback URL.

---

### Epic F — Consultation Scheduler **[v1.1]**

#### US-F1 · Book a consultation
> As a **customer**, I can book a consultation (in-studio or video) linked to my custom request.

**Acceptance Criteria**
1. `/custom/book` shows available slots for the next 30 days based on owner-defined weekly availability and blackout dates.
2. Selecting a slot creates an `Appointment` with status `REQUESTED` (or `CONFIRMED` if auto-confirm is enabled).
3. Double-booking the same slot is impossible (DB constraint/transaction).
4. Customer and owner receive confirmation emails with an `.ics` attachment.
5. Customer can cancel/reschedule up to 24 h before start.

**Definition of Done**
- [ ] Availability model (`AvailabilityRule`, `BlackoutDate`) migrated; slot generation is a pure, unit-tested function that handles the owner's timezone and DST.
- [ ] All times stored in UTC; displayed in the viewer's local timezone with the studio timezone shown alongside.

#### US-F2 · Owner manages appointments
> As the **owner**, I can view, confirm, reschedule, and mark appointments completed/no-show from `/admin/appointments` (calendar + list views).

**DoD:** Admin-guarded actions; appointment status changes visible on the Client Profile (US-C2).

---

### Epic G — Automated Fitting Reminders **[v1.1]**

#### US-G1 · Reminder emails
> As a **customer**, I receive reminders before my fitting and pickup appointments.

**Acceptance Criteria**
1. For `FITTING` and `PICKUP` appointments, reminders are scheduled at **48 h** and **3 h** before start.
2. Rescheduling or cancelling an appointment updates/cancels pending reminders.
3. Each reminder is sent at most once (idempotent), even if the job runs twice.
4. Failures are recorded on the `Reminder` row and retried up to 3 times.

**Definition of Done**
- [ ] Vercel Cron hits `src/app/api/cron/reminders/route.ts` every 15 minutes, protected by `CRON_SECRET`.
- [ ] Email provider abstraction in `src/lib/email.ts` (Resend recommended); templates via React Email.
- [ ] Unit tests for scheduling math; integration test for idempotency.

---

### Epic H — Reviews **[v1.1]**

#### US-H1 · Leave a review
> As a **customer** with a `COMPLETED` custom order or `FULFILLED` RTW order, I can leave a 1–5 star review with text.

**Acceptance Criteria**
1. Only eligible customers see the review form; one review per order.
2. Reviews are hidden until the owner approves them in `/admin/reviews`.
3. Approved reviews display on the product page and a testimonials section on the home page.

**Definition of Done**
- [ ] Eligibility check server-side; DB unique constraint on (`userId`, `customOrderId`) and (`userId`, `productId`).

---

## 7. Route Map

| Route | Group | Access | Story |
|---|---|---|---|
| `/` | (shop) | Public | — |
| `/shop` | (shop) | Public | US-A1 |
| `/shop/[slug]` | (shop) | Public | US-A2, A3, A4, D2 |
| `/checkout/[productId]` | (shop) | Customer | US-A4 |
| `/custom` | (custom) | Public | Landing for custom journey |
| `/custom/gallery` | (custom) | Public | US-B2 |
| `/custom/request` | (custom) | Customer | US-B1 |
| `/custom/request/success` | (custom) | Customer | US-B1 |
| `/custom/book` | (custom) | Customer | US-F1 |
| `/account/wardrobe` | (account) | Customer | US-D1 |
| `/account/wardrobe/[orderId]` | (account) | Customer (owner of order) | US-D1 |
| `/account/measurements` | (account) | Customer | US-B3 |
| `/account/profile` | (account) | Customer | US-E1 |
| `/sign-in` | — | Public | US-E1 |
| `/admin` | admin | Admin | Dashboard summary |
| `/admin/orders`, `/admin/orders/[id]` | admin | Admin | US-C1 |
| `/admin/clients`, `/admin/clients/[id]` | admin | Admin | US-C2 |
| `/admin/products`, `/admin/swatches`, `/admin/portfolio` | admin | Admin | US-C3 |
| `/admin/appointments` | admin | Admin | US-F2 |
| `/admin/reviews` | admin | Admin | US-H1 |
| `/api/auth/[...nextauth]` | api | — | US-E1 |
| `/api/uploads` | api | Customer/Admin | US-B1, C3 |
| `/api/webhooks/payments` | api | Signed webhook | US-A4 |
| `/api/cron/reminders` | api | `CRON_SECRET` | US-G1 |

> **Note:** Route groups `(shop)`, `(custom)`, `(account)` do not appear in URLs. The `(account)` group therefore serves paths under a literal `account/` segment: `src/app/(account)/account/...`.

---

## 8. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | Shop and product pages: LCP < 2.5 s on 4G mobile; Lighthouse Performance ≥ 90. Images served via `next/image` with responsive sizes. |
| NFR-2 | Accessibility | WCAG 2.2 AA. All interactive elements keyboard-operable; status is never conveyed by color/greyscale alone (badges carry text). Automated axe checks in E2E. |
| NFR-3 | Security | Server-side authorization on every mutation; Zod validation on every input; CSRF protection via Server Actions/Auth.js; uploads restricted by MIME/size; secrets only in env vars; no PII in logs. |
| NFR-4 | Privacy | Measurements are personal data: visible only to the owning customer and admins. Customers can request account deletion (manual admin process in MVP; documented in privacy policy). |
| NFR-5 | Reliability | Payment webhooks and cron jobs are idempotent. DB migrations are forward-only and run in CI before deploy. |
| NFR-6 | Observability | Structured server logs; error tracking (Sentry recommended) on client and server. |
| NFR-7 | SEO | SSR/SSG for public pages, `sitemap.xml`, `robots.txt`, product structured data (JSON-LD `Product` with `availability`). |
| NFR-8 | Browser support | Last 2 versions of Chrome, Safari (incl. iOS), Firefox, Edge. |
| NFR-9 | Responsiveness | Mobile-first; all flows usable at 360 px width. |

---

## 9. Technical Constraints & Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router)**, latest stable (≥ 14) | Server Components by default; `"use client"` only where needed. |
| Language | **TypeScript**, `strict: true` | `noUncheckedIndexedAccess: true` recommended. No `any` without a justifying comment. |
| Styling | **Tailwind CSS** + **shadcn/ui** | Design tokens in Tailwind config. |
| Database | **PostgreSQL** (Neon or Supabase) | Separate DBs/branches for dev, preview, prod. |
| ORM | **Prisma** | `prisma migrate dev` locally; `prisma migrate deploy` in CI/CD. Singleton client in `src/lib/prisma.ts`. |
| Validation | **Zod** | Schemas shared between client and server in `src/lib/validators/`. |
| Auth | **Auth.js (NextAuth) v5** + Prisma adapter | Magic link + Google. |
| File storage | **Vercel Blob** | Client uploads with server-issued tokens. |
| Payments | **Stripe Checkout** (pending [OQ-1](#13-open-questions--decisions-log)) | Webhook-driven order finalization. |
| Email | **Resend** + React Email | Behind `src/lib/email.ts` interface. |
| Scheduling | **Vercel Cron** | For reminders (v1.1). |
| Testing | **Jest** + **React Testing Library**; **Playwright** for E2E | See §11. |
| Lint/format | ESLint (next config) + Prettier | Enforced in CI. |
| Node | **v20 LTS or newer** | Pinned via `.nvmrc` and `engines`. |
| Package manager | **pnpm** | Lockfile committed. |
| Hosting | **Vercel** | Server Actions and Route Handlers as backend; preview deploy per PR. |
| CI | **GitHub Actions** | Lint, typecheck, unit tests, `prisma validate`, build, E2E on preview. |

### Architectural Rules (AI must follow)
1. **Mutations** go through Server Actions in `src/server/actions/`; use Route Handlers only for webhooks, cron, uploads, and Auth.js.
2. **Every Server Action** begins with: (a) `auth()` session check, (b) role check if admin, (c) Zod `safeParse`. Returns a discriminated union result — never throws to the client for validation errors.
3. **Business rules** (status transitions, progress mapping, inventory derivation, slot generation) live in pure functions under `src/lib/` and are unit-tested independently of React/Prisma.
4. **No direct Prisma calls from Client Components.** Data access is in Server Components, Server Actions, or `src/server/` loaders.
5. **Environment variables** are validated at boot with Zod in `src/lib/env.ts`; a missing var fails the build.

### Required Environment Variables
```
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_RESEND_KEY=          # magic-link email
ADMIN_EMAILS=             # comma-separated
BLOB_READ_WRITE_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
EMAIL_FROM=
CRON_SECRET=              # v1.1
NEXT_PUBLIC_SITE_URL=
STUDIO_TIMEZONE=          # e.g. Africa/Nairobi (see OQ-3)
MIN_LEAD_TIME_DAYS=14
```

---

## 10. File / Folder Structure

```
dna-stitches/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (shop)/
│   │   │   ├── page.tsx                 # Home
│   │   │   ├── shop/page.tsx
│   │   │   ├── shop/[slug]/page.tsx
│   │   │   └── checkout/[productId]/page.tsx
│   │   ├── (custom)/
│   │   │   └── custom/
│   │   │       ├── page.tsx
│   │   │       ├── gallery/page.tsx
│   │   │       ├── request/page.tsx
│   │   │       ├── request/success/page.tsx
│   │   │       └── book/page.tsx        # v1.1
│   │   ├── (account)/
│   │   │   └── account/
│   │   │       ├── layout.tsx           # auth guard
│   │   │       ├── wardrobe/page.tsx
│   │   │       ├── wardrobe/[orderId]/page.tsx
│   │   │       ├── measurements/page.tsx
│   │   │       └── profile/page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx               # admin guard
│   │   │   ├── page.tsx
│   │   │   ├── orders/…
│   │   │   ├── clients/…
│   │   │   ├── products/…
│   │   │   ├── swatches/…
│   │   │   ├── portfolio/…
│   │   │   ├── appointments/…           # v1.1
│   │   │   └── reviews/…                # v1.1
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── uploads/route.ts
│   │   │   ├── webhooks/payments/route.ts
│   │   │   └── cron/reminders/route.ts  # v1.1
│   │   ├── sign-in/page.tsx
│   │   ├── layout.tsx
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/                          # shadcn primitives (generated)
│   │   ├── shop/                        # ProductCard, StatusBadge, SpecTable…
│   │   ├── custom/                      # SwatchGrid, RequestStepper, ImageUploader…
│   │   ├── account/                     # OrderProgress, MeasurementForm…
│   │   └── admin/                       # PipelineBoard, ClientProfile…
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── env.ts
│   │   ├── email.ts
│   │   ├── rate-limit.ts
│   │   ├── units.ts
│   │   ├── inventory.ts
│   │   ├── custom-order/status.ts
│   │   └── validators/                  # Zod schemas
│   ├── server/
│   │   ├── actions/                     # "use server" mutations
│   │   ├── loaders/                     # server-only read functions
│   │   └── custom/prefill.ts
│   ├── emails/                          # React Email templates
│   └── middleware.ts
├── public/
├── tests/
│   ├── unit/
│   ├── integration/                     # against a test Postgres
│   └── e2e/                             # Playwright
├── .github/workflows/ci.yml
├── .env.example
├── .nvmrc
└── PRD.md
```

---

## 11. Testing Strategy

| Layer | Tool | What is tested | Gate |
|---|---|---|---|
| Unit | Jest | Pure functions in `src/lib/` (status transitions, progress mapping, inventory, units, Zod schemas, slot generation). | ≥ 90% line coverage on `src/lib/`. |
| Component | Jest + RTL | Shop cards/badges, SpecTable, SwatchGrid, RequestStepper, OrderProgress. | Every AC with UI behavior has ≥ 1 test. |
| Integration | Jest + test Postgres (Docker or Neon branch) | Server Actions & loaders: auth/role checks, transactions, concurrency, idempotency. | All authorization rules covered. |
| E2E | Playwright (+ `@axe-core/playwright`) | Critical flows below, run against Vercel preview. | Must pass before merge to `main`. |

### Critical E2E Flows
1. **Browse → buy**: visitor browses shop → signs in → purchases available piece (Stripe test mode) → piece shows as sold out.
2. **Sold-out → custom lead**: sold-out page → "Request Custom Version" → sign in → pre-filled form → submit → appears in admin pipeline with source product.
3. **Portfolio → custom lead**: gallery → "I want something like this" → submit.
4. **Admin pipeline**: admin moves an order through every status → customer's My Wardrobe shows matching progress.
5. **Access control**: customer cannot access `/admin/*` or another user's order.
6. **Notify me**: visitor joins notify list on sold-out page; duplicate submit is idempotent.

---

## 12. Global Definition of Done

A story is **Done** only when, in addition to its own AC and DoD:

- [ ] Code is TypeScript-strict clean (`tsc --noEmit` passes) and lint-clean.
- [ ] All new business logic has unit tests; all AC are covered by at least one automated test.
- [ ] Inputs validated with shared Zod schemas on the server.
- [ ] Authorization enforced server-side and covered by a test.
- [ ] Prisma migration created (if schema changed) and seed updated.
- [ ] Loading, empty, and error states implemented for every new screen.
- [ ] Responsive at 360 px, 768 px, 1280 px; keyboard accessible; no new axe violations.
- [ ] No secrets or PII committed or logged.
- [ ] CI green; Vercel preview reviewed.
- [ ] PRD updated if behavior deviated from this spec.

---

## 13. Open Questions & Decisions Log

### Open Questions (must be resolved before the related story starts)

| ID | Question | Blocks | Proposed default |
|---|---|---|---|
| OQ-1 | Which payment provider? (Stripe availability vs. local options such as M-Pesa / Paystack / Flutterwave depending on market.) | US-A4 | Stripe Checkout, behind a `PaymentProvider` interface so a second provider can be added. |
| OQ-2 | Do custom orders require a deposit before `IN_PRODUCTION`? | US-C1 | Not in MVP; track `quotedPriceCents` only. Deposits in v1.2. |
| OQ-3 | Primary market, currency, and studio timezone? | US-A4, F1 | Single currency + single `STUDIO_TIMEZONE` env var. |
| OQ-4 | Pickup only, or also shipping/delivery for RTW and custom pieces? | US-A4, C1 | Pickup + flat-rate local delivery; `READY_FOR_PICKUP` label becomes "Ready" if delivery is added. |
| OQ-5 | Can guests submit custom requests without an account? | US-B1 | No — sign-in required to link measurements and enable My Wardrobe. |
| OQ-6 | Return/refund policy for 1-of-1 RTW pieces? | US-A4 | Final sale except defects; policy page required before launch. |

### Decisions

| ID | Decision | Rationale |
|---|---|---|
| D-1 | Added `REQUEST_RECEIVED`, `COMPLETED`, and `CANCELLED` to the pipeline beyond the original five stages. | Owner needs a triage inbox before consultation, and orders need terminal states for reporting and progress = 100%. |
| D-2 | Keep `LOW_STOCK` in the enum even though most pieces are 1-of-1. `inventoryStatus` is derived from `quantity` (`0 → SOLD_OUT`, `≤ threshold → LOW_STOCK`, else `AVAILABLE`); default threshold = 1, so a single remaining unit of a small-batch drop shows "Last One". | Supports occasional small-batch drops without schema change; true 1-of-1s with `quantity = 1` display as "Last One"/Available per owner preference (configurable). |
| D-3 | Measurement profiles are append-only versions. | Preserves history for the Client Profile and protects against accidental overwrites of atelier-taken measurements. |
| D-4 | Admin routes return 404 to non-admins. | Avoids advertising the admin surface. |
| D-5 | Vercel Blob for uploads. | Native to the Vercel deploy target; minimal config. |

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **RTW** | Ready-to-wear: finished pieces sold as-is. |
| **1-of-1** | A unique piece; only one exists. |
| **Custom order** | A made-to-measure garment commissioned by a customer. |
| **Pipeline** | The ordered set of `CustomOrderStatus` stages. |
| **Measurement profile** | A dated, labeled set of body measurements belonging to a customer. |
| **Swatch** | A fabric sample available for custom orders. |
| **Portfolio item** | A past piece shown in the style gallery as inspiration. |
| **Reference ID** | The `PortfolioItem.id` (or `Product.id`) used to pre-fill a custom request. |
| **Lead** | A custom order in `REQUEST_RECEIVED` / `CONSULTATION_PENDING`. |

---

## 15. Reference Documentation

- Next.js — https://nextjs.org/docs
- Prisma — https://www.prisma.io/docs/
- Auth.js — https://authjs.dev
- Zod — https://zod.dev
- shadcn/ui — https://ui.shadcn.com
- Vercel CLI — https://vercel.com/docs/cli
- Vercel Blob — https://vercel.com/docs/storage/vercel-blob
- Playwright — https://playwright.dev
- Cursor — https://cursor.com/docs
- GitHub Actions — https://docs.github.com/en/actions
