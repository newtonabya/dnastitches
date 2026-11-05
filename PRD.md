# DNA Stitches — Product Requirements Document (PRD)

> **Status:** v1.3 — MVP (v1.0) and v1.1 built. Where the build differs from the original text, see D-14 to D-21 in §13.
> **Owner:** Newton Abya
> **Last updated:** 2026-11-02
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

`User` (Customer / Admin), `Product` (Ready-to-Wear), `ProductImage`, `Order` (RTW purchase), `Payment`, `Address`, `DeliveryZone`, `CustomOrder`, `CustomOrderStatusLog`, `MeasurementProfile`, `FabricSwatch`, `PortfolioItem`, `Appointment`, `Review`, `NotificationRequest`, `Reminder`.

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
- Multi-currency, international shipping and international tax calculation. v1 trades in **Nigerian Naira (NGN)** only, within Nigeria (see [D-8](#13-open-questions--decisions-log)).
- Refunds and returns. All sales are final (see [D-11](#13-open-questions--decisions-log)); defects are repaired free of charge instead (see [D-13](#13-open-questions--decisions-log)).
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
| **MVP (v1.0)** | Auth, RTW shop (browse, detail, Paystack checkout, pickup or delivery), sold-out → custom upsell, custom request form with uploads, swatches & measurements, admin pipeline + client profile, custom-order quotes with Paystack deposit and balance payments, My Wardrobe progress, notify-me list. | A, B, C, D, E (core) |
| **v1.1** | Consultation scheduler, automated fitting reminders (email), reviews. | F, G, H |
| **v1.2+** | SMS/WhatsApp reminders (built: US-G2), analytics dashboard (built: US-C5), restock auto-notify (built: US-D4), courier API integration. | D, G |

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
  AWAITING_DEPOSIT        // quote sent; production starts only after deposit is paid
  IN_PRODUCTION
  FITTING
  READY                   // ready for pickup or out for delivery (label depends on fulfilment method)
  COMPLETED               // collected / delivered
  CANCELLED
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  FULFILLED
  CANCELLED               // only before payment; no refunds after payment (D-11)
}

enum FulfillmentMethod {
  PICKUP
  DELIVERY
}

enum PaymentKind {
  RTW_FULL
  CUSTOM_DEPOSIT
  CUSTOM_BALANCE
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
  ABANDONED
}

enum PaymentChannel {
  PAYSTACK                // card, bank transfer, USSD via Paystack
  OFFLINE                 // cash or direct transfer recorded by admin
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
| **Product** | `id`, `slug` (unique), `name`, `description`, `priceKobo` (Int), `currency` (default `NGN`), `inventoryStatus`, `quantity` (Int, default 1), `bustCm`, `waistCm`, `hipsCm`, `lengthCm` (Decimal), `sizeLabel?`, `fabricComposition`, `careInstructions`, `isPublished`, timestamps | `images ProductImage[]`, `fabricSwatch FabricSwatch?`. `inventoryStatus` is derived from `quantity` on write (see US-A1). |
| **ProductImage** | `id`, `productId`, `url`, `alt`, `sortOrder` | |
| **Order** | `id`, `userId`, `productId`, `subtotalKobo`, `deliveryFeeKobo` (0 for pickup), `totalKobo`, `status`, `fulfillmentMethod`, `addressId?`, `deliveryZoneId?`, `finalSaleAcknowledgedAt`, `fulfilledAt?`, timestamps | One product per order in v1 (1-of-1 pieces). `addressId` required when `fulfillmentMethod = DELIVERY`. An unexpired `PENDING_PAYMENT` order holds the piece for 15 minutes (D-14). |
| **Payment** | `id`, `userId`, `kind`, `channel`, `status`, `amountKobo`, `currency`, `orderId?`, `customOrderId?`, `paystackReference?` (unique), `paidAt?`, `recordedById?` (admin, for OFFLINE), `rawEvent Json?`, timestamps | Exactly one of `orderId`/`customOrderId` set. Every money movement is a `Payment` row. |
| **Address** | `id`, `userId`, `recipientName`, `phone` (+234), `line1`, `line2?`, `city`, `state` (one of 36 states + FCT), `landmark?`, `isDefault` | Reused across RTW and custom orders. |
| **RepairRequest** | `id`, `userId`, `orderId?`, `customOrderId?`, `description`, `photoUrls String[]`, `status` (`OPEN`\|`IN_REPAIR`\|`RESOLVED`\|`REJECTED`), `adminNotes?` (private), `rejectionReason?` (shown to the customer), `resolvedAt?`, timestamps | Exactly one of `orderId`/`customOrderId` set. Only allowed within 7 days of handover (D-13); one open request per piece (D-19). |
| **DeliveryZone** | `id`, `name` (e.g. "Lagos Mainland"), `states String[]`, `feeKobo`, `etaDays`, `isActive` | Flat-rate delivery fee per zone, managed by admin. |
| **FabricSwatch** | `id`, `name`, `colorHex`, `imageUrl`, `composition`, `isAvailable`, `sortOrder` | |
| **PortfolioItem** | `id`, `title`, `description`, `imageUrl`, `tags String[]`, `isPublished`, `sourceProductId?` | `id` is the **referenceId** used to pre-fill custom requests (US-B2). |
| **MeasurementProfile** | `id`, `userId`, `label` (e.g. "Wedding 2026"), `unit`, `bust`, `waist`, `hips`, `shoulder?`, `armLength?`, `inseam?`, `height?`, `notes?`, `takenBy` (`SELF`\|`ADMIN`), `isDefault`, timestamps | A user may have many; exactly zero or one `isDefault = true`. Profiles are **versioned by creation** — edits create a new row so history is preserved (US-C2). |
| **CustomOrder** | `id`, `reference` (human-readable, e.g. `DNA-2026-0042`), `userId`, `status`, `title`, `description`, `occasion?`, `targetDate?`, `budgetKobo?`, `referenceImageUrls String[]`, `portfolioItemId?`, `sourceProductId?`, `fabricSwatchId?`, `measurementProfileId?`, `quotedPriceKobo?`, `depositKobo?`, `quoteSentAt?`, `completedAt?`, `fulfillmentMethod?`, `addressId?`, `deliveryFeeKobo?`, `adminNotes?` (private), timestamps | `statusLogs CustomOrderStatusLog[]`, `appointments Appointment[]`, `payments Payment[]`. Balance due = `quotedPriceKobo + deliveryFeeKobo − sum(successful payments)`. |
| **CustomOrderStatusLog** | `id`, `customOrderId`, `fromStatus?`, `toStatus`, `changedById`, `note?`, `createdAt` | Append-only audit trail. |
| **Appointment** | `id`, `userId`, `customOrderId?`, `type`, `mode` (`IN_STUDIO`\|`VIDEO`), `status`, `startsAt`, `endsAt`, `notes?` (from the customer), `adminNotes?` (private) | [v1.1] No two active (`REQUESTED`/`CONFIRMED`) appointments may overlap: one studio calendar. |
| **AvailabilityRule** | `id`, `weekday` (0 = Sunday), `startMinute`, `endMinute`, `isActive` | [v1.1] Weekly booking hours in `STUDIO_TIMEZONE`; several per day allowed. |
| **BlackoutDate** | `id`, `date` (studio-local, unique), `reason?` | [v1.1] No bookings that day; existing appointments are kept. |
| **Reminder** | `id`, `appointmentId`, `channel` (`EMAIL`\|`SMS`), `offsetMinutes`, `sendAt`, `sentAt?`, `skippedAt?`, `attempts`, `lockedUntil?`, `error?` | [v1.1] Processed by a scheduled job. Unique on (`appointmentId`, `channel`, `offsetMinutes`); claimed before sending so it goes out at most once. |
| **Review** | `id`, `userId`, `productId?`, `customOrderId?`, `rating` (1–5), `body`, `displayName`, `isApproved`, `moderatedAt?`, `createdAt` | [v1.1] Exactly one of `productId`/`customOrderId` must be set. Pending until moderated; hidden = moderated and not approved (D-20). |
| **NotificationRequest** | `id`, `email`, `userId?`, `productId?`, `type`, `createdAt`, `notifiedAt?` | Unique on (`email`, `productId`, `type`). |

### 5.3 Data Rules
- **Money** is stored as integer kobo (₦1 = 100 kobo) in `*Kobo` fields. Never floats. Displayed with `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })` via `src/lib/money.ts`.
- **Phone numbers** are normalised to E.164 (`+234…`); Nigerian local formats (`080…`) are accepted on input.
- **Dates/times** are stored in UTC and displayed in `Africa/Lagos` (WAT, UTC+1, no DST).
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
> As a **customer**, I can buy an available 1-of-1 piece and choose pickup or delivery.

**Acceptance Criteria**
1. Given a product is `AVAILABLE` or `LOW_STOCK`, I can click "Buy Now" and go to `/checkout/[productId]`.
2. At checkout I choose **Pickup** (studio address and hours shown, no fee) or **Delivery** (select or add a Nigerian address; the delivery fee is looked up from the `DeliveryZone` covering its state and shown before payment). If no active zone covers the state, delivery is unavailable and pickup is offered.
3. I must tick **"I understand all sales are final — no refunds or returns"** before the Pay button is enabled. The timestamp is stored on the order.
4. Payment uses **Paystack** (card, bank transfer, USSD). Amount = product price + delivery fee, in NGN.
5. Given two customers attempt to buy the last unit concurrently, then exactly one succeeds; the other sees "This piece was just claimed" and is offered "Request Custom Version".
6. On successful payment (confirmed by webhook **and** server-side transaction verification), `quantity` decrements, `inventoryStatus` is re-derived (typically → `SOLD_OUT`), the `Order` becomes `PAID`, a `Payment` row is recorded, and a confirmation email with pickup/delivery details is sent.
7. If payment is abandoned, the reservation is released after 15 minutes and the order is `CANCELLED`.
8. Admin can mark a paid order `FULFILLED` (picked up or delivered). `fulfilledAt` is stored and starts the 7-day defect window (US-D3).

**Definition of Done**
- [ ] Stock is reserved inside a Prisma `$transaction` with a conditional update (`WHERE quantity > 0`), so there is no read-then-write race. *(As built: a row lock plus a 15-minute pending-order hold; see D-14.)*
- [ ] Payment provider interface in `src/lib/payments/` with a Paystack implementation: initialise transaction, verify transaction, and webhook handling.
- [ ] Webhook handler `src/app/api/webhooks/paystack/route.ts` verifies the `x-paystack-signature` HMAC-SHA512 against the secret key, re-verifies via the Paystack Verify Transaction API, and is idempotent on `paystackReference` (same event twice ⇒ one payment).
- [ ] Delivery fee resolution `resolveDeliveryFee(state)` is a pure, unit-tested function.
- [ ] Integration test simulating concurrent purchase; unit test that the Pay action rejects requests without final-sale acknowledgement.

---

### Epic B — The Custom Journey

#### US-B1 · Submit a custom design request **[MVP]**
> As a **customer**, I can submit a design request with reference images, a fabric swatch, and my measurements.

**Acceptance Criteria**
1. Visitors must create an account or sign in **before** the form opens (see [D-10](#13-open-questions--decisions-log)). The form at `/custom/request` is a multi-step flow: **(1) Design** — title, description, occasion, target date, budget (optional), up to 5 reference images; **(2) Fabric** — visual swatch grid, single select, or "Not sure — advise me"; **(3) Measurements** — pick a saved profile, enter new, or "Book a measurement appointment instead"; **(4) Review & submit**.
2. Images: JPEG/PNG/WebP/HEIC only, ≤ 8 MB each, ≤ 5 files. Invalid files show an inline error and are not uploaded.
3. Validation errors are shown inline per field, both client-side (instant) and server-side (authoritative). The same Zod schema is used for both.
4. Target date, if given, must be ≥ 14 days in the future (configurable `MIN_LEAD_TIME_DAYS`).
5. New measurements entered in step 3 are saved as a `MeasurementProfile` linked to my user and available for reuse next time.
6. On submit, a `CustomOrder` is created with status `REQUEST_RECEIVED`, my preferred fulfilment method (pickup or delivery + address) is recorded, a human-readable reference (e.g. `DNA-2026-0042`) is shown on a confirmation screen, and both I and the owner receive an email.
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
REQUEST_RECEIVED → CONSULTATION_PENDING → MEASUREMENTS_TAKEN → AWAITING_DEPOSIT → IN_PRODUCTION → FITTING → READY → COMPLETED
                                     (any state before IN_PRODUCTION) → CANCELLED
                                               FITTING → IN_PRODUCTION   (alterations loop)

Gates (enforced server-side):
  → AWAITING_DEPOSIT  requires quotedPriceKobo and depositKobo to be set (quote sent to customer)
  → IN_PRODUCTION     requires a SUCCESS deposit payment (set automatically by the Paystack webhook, or by admin recording an OFFLINE payment)
  → COMPLETED         requires balance due = 0
```

**Acceptance Criteria**
1. `/admin/orders` shows a Kanban board with one column per non-terminal status; `COMPLETED`/`CANCELLED` are in a filterable list view.
2. I can move a card via drag-and-drop **or** via a status `<select>` on the order detail page (accessible fallback).
3. Only transitions in the diagram above are allowed, and gates must be satisfied; invalid moves are rejected server-side with a clear message (e.g. "Deposit not yet paid") and the card snaps back.
4. Every transition writes a `CustomOrderStatusLog` row with from, to, admin, timestamp, and optional note.
5. The order detail page `/admin/orders/[id]` shows the full status timeline, reference images, fabric, linked measurement profile, source (product/portfolio), and private admin notes.
6. Customer receives an email on transitions to `MEASUREMENTS_TAKEN`, `AWAITING_DEPOSIT` (with quote and pay link), `IN_PRODUCTION`, `FITTING`, and `READY` (with balance due and pickup/delivery details).
7. Cancelling an order after a deposit has been paid shows a warning that the deposit is non-refundable (D-11).
8. Optimistic UI updates roll back if the server rejects the transition.

**Definition of Done**
- [ ] Transition table `ALLOWED_TRANSITIONS` + `canTransition(from, to, order)` (including gates) in `src/lib/custom-order/status.ts`, exhaustively unit-tested (every from×to pair, gate satisfied and unsatisfied).
- [ ] Server Action `updateCustomOrderStatus` checks `ADMIN` role, validates transition, and updates order + log atomically.
- [ ] Drag-and-drop library is accessible (e.g. `@dnd-kit` with keyboard sensor).

#### US-C2 · Client Profile view **[MVP]**
> As the **owner**, I can see a customer's measurement history and all past orders in one place.

**Acceptance Criteria**
1. `/admin/clients` lists customers with search by name/email/phone and shows count of custom orders and last activity.
2. `/admin/clients/[id]` aggregates: contact info; all `MeasurementProfile` versions (newest first, with diff highlighting vs previous); all `CustomOrder`s with status; all RTW `Order`s; payments; repair requests; appointments; notify-me requests.
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

#### US-C4 · Quote, deposit and balance payments **[MVP]**
> As the **owner**, I can send a quote with a required deposit; as a **customer**, I can pay the deposit and the balance online.

**Acceptance Criteria**
1. On `/admin/orders/[id]`, I can enter the quoted price, delivery fee (pre-filled from the customer's delivery zone, or 0 for pickup) and deposit amount. The deposit defaults to `DEPOSIT_PERCENT` (default 50%) of the quote and can be edited. Saving and sending moves the order to `AWAITING_DEPOSIT` and emails the customer.
2. The customer sees the quote, deposit and balance on `/account/wardrobe/[orderId]` with a **Pay deposit** button (Paystack). Before paying they must tick "I understand the deposit is non-refundable and all sales are final".
3. A successful deposit payment automatically moves the order to `IN_PRODUCTION`, writes a status log entry with `changedBy = system`, and emails both parties.
4. When the order reaches `READY`, the customer sees **Pay balance**. The order can only be marked `COMPLETED` once the balance is 0.
5. Admin can record an **offline** payment (cash or direct bank transfer) with amount and note; it counts towards deposit/balance exactly like a Paystack payment and is attributed to the admin.
6. Amounts are shown in NGN (e.g. ₦250,000.00) everywhere.

**Definition of Done**
- [ ] Server Actions `sendQuote`, `startCustomOrderPayment(kind)`, `recordOfflinePayment` (admin-only where applicable), all Zod-validated.
- [ ] `computeBalance(order, payments)` is a pure, unit-tested function.
- [ ] Shared Paystack webhook (US-A4) routes `CUSTOM_DEPOSIT` / `CUSTOM_BALANCE` payments by metadata; idempotent.
- [ ] E2E: admin sends quote → customer pays deposit (Paystack test mode) → order auto-moves to In Production.

#### US-C5 · Analytics dashboard **[v1.2]**
> As the **owner**, I can see how the business is doing over a period I choose.

**Acceptance Criteria**
1. `/admin/analytics` has a range filter: last 30 days (default), 90 days, 12 months, or all time. Days are counted in `STUDIO_TIMEZONE`.
2. **Revenue:** money received in the range (successful payments, by the day they were paid), split into shop and custom (deposits and balances), and into online (Paystack) and cash or transfer (offline).
3. **Trend:** a column chart of revenue for each of the last 12 months, with a hover/focus tooltip per month and the same figures as a table.
4. **Shop:** pieces sold and average order value.
5. **Custom orders:** of the requests received in the range, how many were quoted, paid a deposit, completed or were cancelled, with rates; and the median days from request to completion for orders completed in the range.
6. **Most wanted:** the pieces with the most notify-me requests still waiting.
7. **Appointments:** bookings by type (not counting cancelled), and the no-show rate among past appointments. **Reviews:** count and average rating.
8. Admins only; empty periods show zeros and dashes, never errors.

**Definition of Done**
- [ ] Range, month and rate arithmetic are pure, unit-tested functions (`src/lib/analytics.ts`).
- [ ] Integration tests with exact figures on an isolated date window; E2E with axe on desktop and mobile.

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
   | `AWAITING_DEPOSIT` | 40% |
   | `IN_PRODUCTION` | 55% |
   | `FITTING` | 80% |
   | `READY` | 95% |
   | `COMPLETED` | 100% |
   | `CANCELLED` | — (shown as "Cancelled", no bar) |

3. Each order shows a customer-friendly timeline of status changes (admin notes are **never** shown), plus quote, amount paid and balance due.
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
- [ ] Auto-sending restock emails is **out of scope** for MVP (v1.2). *(Built in v1.2 as US-D4.)*

#### US-D4 · Restock emails **[v1.2]**
> As a **visitor or customer** who asked to hear about a restock, I get one email when the piece is available again.

**Acceptance Criteria**
1. When the owner saves a product that is published and in stock, every `RESTOCK` request for it that hasn't been emailed is emailed once, with the piece's name, price and link, and `notifiedAt` is set.
2. Each request is emailed at most once, even if two saves happen at the same moment. A request whose email fails is retried on the next save.
3. The owner sees how many people are being emailed in the save confirmation, and when each request was emailed on the admin product page and in the CSV export.
4. `SIMILAR_FABRIC` requests are not emailed automatically (D-22).

**Definition of Done**
- [ ] Requests are claimed with one atomic `UPDATE … RETURNING` that also checks the product is published and in stock.
- [ ] Integration tests for the claim conditions, concurrent saves and retry after a failed email; E2E for restock from the admin product page.

#### US-D3 · Report a defect for free repair **[MVP]**
> As a **customer**, I can report a defect in a piece I received and have it repaired or altered free of charge.

**Acceptance Criteria**
1. For an RTW order that is `FULFILLED`, or a custom order that is `COMPLETED`, My Wardrobe shows **Report a defect** for 7 days after handover. After that the button is hidden and the server rejects new requests.
2. I describe the problem and attach up to 3 photos (same upload rules as US-B1). A `RepairRequest` with status `OPEN` is created and the owner is emailed.
3. The owner reviews it at `/admin/repairs`, moves it through `OPEN → IN_REPAIR → RESOLVED`, or `REJECTED` with a reason (e.g. damage caused after handover). I'm emailed on every change and see the status in My Wardrobe.
4. Repairs never create a payment or refund. The terms page states: no refunds or returns; manufacturing defects reported within 7 days are repaired or altered free of charge.

**Definition of Done**
- [ ] `isWithinDefectWindow(handoverAt, now)` is a pure, unit-tested function (boundary at exactly 7 days); `REPAIR_WINDOW_DAYS=7` is configurable.
- [ ] Server Actions `createRepairRequest` (owner of the order only) and `updateRepairRequest` (admin only), Zod-validated.
- [ ] Repair requests appear on the Client Profile (US-C2).

---

### Epic E — Authentication & Accounts

#### US-E1 · Sign up / sign in **[MVP]**
> As a **visitor**, I can create an account and sign in.

**Acceptance Criteria**
1. Sign-in options: email magic link and Google OAuth.
2. New users get `role = CUSTOMER`. The first admin is assigned via seed/env (`ADMIN_EMAILS`), never via UI.
3. `callbackUrl` is honored after sign-in, restricted to same-origin paths.
4. Signed-in users can update name and phone (Nigerian format, stored as +234) and manage delivery addresses at `/account/profile`.
5. Signing in is required before buying, starting a custom request, or booking; the call-to-action buttons send visitors to sign-up with the right `callbackUrl`.

**Definition of Done**
- [ ] Auth.js v5 config in `src/lib/auth.ts` with Prisma adapter; `role` exposed on the session via callbacks and typed via module augmentation.
- [ ] Middleware (`src/proxy.ts`; Next.js 16 renamed `middleware.ts` to `proxy.ts`) protects `/account/*`, `/admin/*`, and `/custom/request`.
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

**Implementation notes (v1.1 build):**
- Slots are `CONSULTATION_MINUTES` long, start back-to-back from each rule's start, and must begin at least 24 h ahead (the same cutoff as AC5, so every booking can still be changed). Customers book consultations only; moving a fitting or pickup online isn't offered (contact the studio).
- AC3 is enforced in a transaction holding a Postgres advisory lock that re-checks the slot and every overlap, rather than a DB constraint (the slot grid can change and admin bookings vary in length).
- The owner can also book fittings, pickups and other appointments for a custom order from `/admin/orders/[id]` (confirmed immediately), which US-G1's reminders build on. Admin rescheduling may use any free time, not only the weekly hours.
- Booking hours and blocked dates are managed in `/admin/settings`.

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


**Implementation notes (v1.1 build):**
- A reminder whose time has already passed when the appointment is booked or moved isn't created (the booking email and calendar invite cover it). If the job was down and both reminders are overdue, only the 3 h one is sent.
- At-most-once (AC3): a runner claims each reminder with a conditional update and a 10-minute lease before sending; `sentAt` is set after. "Retried up to 3 times" (AC4) means 4 attempts in total; the last error is kept on the row and shown on the admin appointment page.
- The 15-minute trigger is a scheduled GitHub Actions workflow by default, because Vercel Cron more often than daily needs the Pro plan. Vercel Cron works too (see README).
---

#### US-G2 · Text reminders (SMS / WhatsApp) **[v1.2]**
> As a **customer**, I can choose to also get fitting and pickup reminders by text.

**Acceptance Criteria**
1. On `/account/profile` I can opt in to text reminders; opting in requires a phone number.
2. When opted in, I get a text at 48 h and 3 h before each `FITTING` and `PICKUP` appointment, in addition to the emails (US-G1). The text names the appointment, its studio-local day and time, and where to change it.
3. Opting out (or removing my phone number) removes pending texts for my upcoming appointments.
4. Each text is sent at most once, failures are recorded and retried, and overdue reminders are superseded per channel, exactly as for emails (US-G1 AC3–AC4).

**Definition of Done**
- [ ] `ReminderChannel.SMS`; `User.smsReminders`; the reminder unique key includes the channel.
- [ ] `SmsProvider` interface with a Termii implementation (`TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_CHANNEL` = `dnd` | `generic` | `whatsapp`); without a key, texts are logged in development and skipped with a visible reason in production.
- [ ] Unit tests for the provider and message; integration tests for planning, opt-out, sending and skipping.

### Epic H — Reviews **[v1.1]**

#### US-H1 · Leave a review
> As a **customer** with a `COMPLETED` custom order or `FULFILLED` RTW order, I can leave a 1–5 star review with text.

**Acceptance Criteria**
1. Only eligible customers see the review form; one review per order.
2. Reviews are hidden until the owner approves them in `/admin/reviews`.
3. Approved reviews display on the product page and a testimonials section on the home page.

**Definition of Done**
- [ ] Eligibility check server-side; DB unique constraint on (`userId`, `customOrderId`) and (`userId`, `productId`).

**Implementation notes (v1.1 build):**
- `Review.displayName` is the public name the customer chooses (defaulting to first name and last initial). Emails are never shown, and testimonials for custom orders say "custom piece" rather than the private request title.
- `Review.moderatedAt` separates "waiting for approval" from "hidden": the owner can approve, or hide a pending or published review. The owner is emailed about each new review.
- The home page shows the six newest approved reviews of 4–5 stars. A product page shows all its approved reviews with the average rating.
- Customers can't edit a review after submitting it; they can contact the studio instead.

---

## 7. Route Map

| Route | Group | Access | Story |
|---|---|---|---|
| `/` | (shop) | Public | — |
| `/shop` | (shop) | Public | US-A1 |
| `/shop/[slug]` | (shop) | Public | US-A2, A3, A4, D2 |
| `/checkout/[productId]` | (shop) | Customer | US-A4 |
| `/checkout/success` | (shop) | Customer | US-A4 (after Paystack) |
| `/custom` | (custom) | Public | Landing for custom journey |
| `/custom/gallery` | (custom) | Public | US-B2 |
| `/custom/request` | (custom) | Customer | US-B1 |
| `/custom/request/success` | (custom) | Customer | US-B1 |
| `/custom/book` | (custom) | Customer | US-F1 |
| `/account/wardrobe` | (account) | Customer | US-D1 |
| `/account/wardrobe/[orderId]` | (account) | Customer (owner of order) | US-D1, C4 |
| `/account/wardrobe/repair` | (account) | Customer (owner of order) | US-D3 |
| `/account/wardrobe/review` | (account) | Customer (owner of order) | US-H1 |
| `/account/appointments` | (account) | Customer | US-F1 (cancel / move) |
| `/account/measurements` | (account) | Customer | US-B3 |
| `/account/profile` | (account) | Customer | US-E1 |
| `/policies/terms` | (shop) | Public | D-11 (all sales final, non-refundable deposits) |
| `/sign-in` | — | Public | US-E1 |
| `/admin` | admin | Admin | Dashboard summary |
| `/admin/orders`, `/admin/orders/[id]` | admin | Admin | US-C1 |
| `/admin/clients`, `/admin/clients/[id]` | admin | Admin | US-C2 |
| `/admin/products`, `/admin/swatches`, `/admin/portfolio` | admin | Admin | US-C3 |
| `/admin/repairs` | admin | Admin | US-D3 |
| `/admin/settings` | admin | Admin | Delivery zones, deposit %, studio address/hours |
| `/admin/appointments`, `/admin/appointments/[id]` | admin | Admin | US-F2 |
| `/admin/reviews` | admin | Admin | US-H1 |
| `/api/auth/[...nextauth]` | api | — | US-E1 |
| `/api/uploads` | api | Customer/Admin | US-B1, C3 |
| `/api/webhooks/paystack` | api | Signed webhook | US-A4, C4 |
| `/api/cron/reminders` | api | `CRON_SECRET` | US-G1 |
| `/api/cron/release-reservations` | api | `CRON_SECRET` | US-A4 AC7 |
| `/api/payments/callback` | api | Public (re-verifies with Paystack) | US-A4, C4 (D-15) |
| `/dev/paystack` | — | Development only | Dev payment gateway (D-15) |

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
| Payments | **Paystack** (card, bank transfer, USSD; NGN) | Behind a `PaymentProvider` interface. Webhook + Verify API finalise payments. |
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
PAYSTACK_SECRET_KEY=      # also used to verify webhook signatures
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
DEPOSIT_PERCENT=50
REPAIR_WINDOW_DAYS=7
RESEND_API_KEY=
EMAIL_FROM=
CRON_SECRET=              # v1.1
NEXT_PUBLIC_SITE_URL=
STUDIO_TIMEZONE=Africa/Lagos
DEFAULT_CURRENCY=NGN
MIN_LEAD_TIME_DAYS=14
STUDIO_ADDRESS=           # shown at checkout and in appointment emails
STUDIO_HOURS=
CONSULTATION_MINUTES=60   # v1.1: booked consultation length (= slot length)
TERMII_API_KEY=           # v1.2: text reminders (optional; set with TERMII_SENDER_ID)
TERMII_SENDER_ID=
TERMII_CHANNEL=dnd        # dnd | generic | whatsapp
APPOINTMENTS_AUTO_CONFIRM=false  # v1.1: true books straight to CONFIRMED
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
│   │   │   ├── webhooks/paystack/route.ts
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
│   │   ├── money.ts
│   │   ├── payments/                    # PaymentProvider + Paystack impl
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
│   └── proxy.ts                         # route protection (Next.js 16 renamed middleware.ts → proxy.ts)
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
| E2E | Playwright (+ `@axe-core/playwright`) | Critical flows below, run in CI against a local server and a seeded Postgres (D-17). | Must pass before merge to `main`. |

### Critical E2E Flows
1. **Browse → buy**: visitor browses shop → signs in → purchases available piece (Paystack test mode, delivery to a Lagos address) → piece shows as sold out.
2. **Sold-out → custom lead**: sold-out page → "Request Custom Version" → sign in → pre-filled form → submit → appears in admin pipeline with source product.
3. **Portfolio → custom lead**: gallery → "I want something like this" → submit.
4. **Admin pipeline + payments**: admin moves an order through the pipeline, sends a quote → customer pays deposit → order auto-moves to In Production → … → customer pays balance → admin completes it; My Wardrobe shows matching progress at each step.
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

### Open Questions

None outstanding. All questions were resolved on 2026-11-01 (D-6 to D-13). New questions are added here as they come up.

### Decisions

| ID | Decision | Rationale |
|---|---|---|
| D-1 | Added `REQUEST_RECEIVED`, `COMPLETED`, and `CANCELLED` to the pipeline beyond the original five stages. | Owner needs a triage inbox before consultation, and orders need terminal states for reporting and progress = 100%. |
| D-2 | Keep `LOW_STOCK` in the enum even though most pieces are 1-of-1. `inventoryStatus` is derived from `quantity` (`0 → SOLD_OUT`, `≤ threshold → LOW_STOCK`, else `AVAILABLE`); default threshold = 1, so a single remaining unit of a small-batch drop shows "Last One". | Supports occasional small-batch drops without schema change; true 1-of-1s with `quantity = 1` display as "Last One"/Available per owner preference (configurable). |
| D-3 | Measurement profiles are append-only versions. | Preserves history for the Client Profile and protects against accidental overwrites of atelier-taken measurements. |
| D-4 | Admin routes return 404 to non-admins. | Avoids advertising the admin surface. |
| D-5 | Vercel Blob for uploads. | Native to the Vercel deploy target; minimal config. |
| D-6 | **Paystack** is the payment provider (was OQ-1). | Strong Nigerian coverage: cards, bank transfer, USSD; settles in NGN. |
| D-7 | **Deposits are required** before production (was OQ-2). New status `AWAITING_DEPOSIT`; default deposit 50% of the quote; balance due before completion. | Protects the atelier's fabric and labour costs on made-to-measure work. |
| D-8 | **Market: Nigeria** (was OQ-3). Currency NGN (stored in kobo), timezone `Africa/Lagos`, +234 phone numbers, addresses by Nigerian state. | Single market keeps tax, currency and logistics simple for v1. |
| D-9 | **Pickup and delivery** both supported for RTW and custom orders (was OQ-4). Delivery is flat-rate per admin-managed zone; `READY_FOR_PICKUP` renamed `READY`. | Customers outside the studio's area can still buy. |
| D-10 | **Account required** to submit custom requests (was OQ-5), as well as to buy or book. | Links measurements, orders and payments to one profile and enables My Wardrobe. |
| D-11 | **No refunds or returns** (was OQ-6). All RTW sales are final; custom-order deposits are non-refundable. Customers must explicitly acknowledge this before every payment; terms are published at `/policies/terms`. `REFUNDED` removed from `OrderStatus`. | Every piece is 1-of-1 or made to measure and cannot be resold. |
| D-12 | **Delivery zones and fees are decided later** (was OQ-7). The owner manages them in `/admin/settings`; the seed script creates clearly-labelled placeholder zones. Entering real zones and fees is a **launch-blocking task**, not a build-blocking one. | Lets development continue while the owner confirms courier pricing. |
| D-13 | **Free repair/alteration for defects within 7 days of handover** (was OQ-8), with still no cash refunds or returns. New `RepairRequest` entity and story US-D3. | Protects customer trust while keeping the no-refund policy. |
| D-14 | **Checkout holds, not stock decrements** (US-A4 DoD). Starting checkout locks the product row (`SELECT … FOR UPDATE`) and creates a `PENDING_PAYMENT` order that holds the piece for 15 minutes. `quantity` decrements only when the payment succeeds. A payment that arrives after its hold lapsed and the piece sold is recorded, and the owner is alerted instead of selling twice. | Nothing has to be "given back" when a checkout is abandoned, and a late payment can't oversell. |
| D-15 | **Paystack return path and dev gateway.** Customers return to the Route Handler `/api/payments/callback`, which re-verifies with Paystack. Without `PAYSTACK_SECRET_KEY` (never in production), payments go to a local `/dev/paystack` page that simulates success or cancellation. | A redirect target must be a route; the dev gateway lets every payment flow run locally and in E2E. |
| D-16 | **Schedulers.** Releasing expired holds runs daily on Vercel Cron, and holds are also released whenever a checkout starts. Reminders (US-G1) are triggered every 15 minutes by a GitHub Actions workflow, not Vercel Cron. | Vercel Hobby allows daily crons only; switching reminders to Vercel Cron on Pro is a one-line `vercel.json` change. |
| D-17 | **E2E runs in CI against a local server**, not Vercel previews. | The tests sign in through the dev magic-link fallback and pay through the dev gateway; previews send real email and take real payments. |
| D-18 | **Rate limits are in-memory** (per server instance): notify-me 5 per IP per 10 minutes; magic-link sign-in 5 per email address and, in production, 30 per IP per 10 minutes. | Good enough for launch; move to a shared store (e.g. Upstash) if abuse appears. |
| D-19 | **Repairs:** a customer-facing `rejectionReason`, separate from private `adminNotes`; one open repair per piece; the 7-day window is inclusive of exactly 7 × 24 h. | Customers deserve a reason; private notes stay private. |
| D-20 | **Reviews:** the customer chooses the public `displayName` (default: first name and last initial); emails and private custom-request titles are never shown publicly; home-page testimonials are approved 4–5 star reviews. Reviews can't be edited after submitting. | Privacy, and keeping moderation simple. |
| D-21 | **Security baseline:** security headers on every response (no framing, nosniff, HSTS, referrer and permissions policies); constant-time `CRON_SECRET` checks; `pnpm audit` clean. A full Content-Security-Policy is deferred (it needs per-request nonces). | Cheap, high-value protections for launch. |
| D-22 | **Restock emails are automatic; similar-fabric ones aren't** (US-D4). A restock is a clear event (the piece is published and in stock), so those requests are emailed on save. "A similar fabric became available" has no such event, so the owner follows those up from the CSV export. | Avoids emailing people about the wrong thing. |
| D-23 | **Text reminders go through Termii, opt-in only** (US-G2). One API covers SMS (including the DND route that reaches numbers on Do-Not-Disturb) and WhatsApp, selected by `TERMII_CHANNEL`. Texts are in addition to emails, never instead of them. The `SmsProvider` interface leaves room for another provider (e.g. Twilio). | Nigeria-first provider and cost; explicit consent for texts. |
| D-24 | **Analytics are computed live from the order data, with no separate tracking** (US-C5). Revenue counts money received, by payment date, not quotes or order totals. The custom funnel follows the requests received in the range (a cohort), so recent requests show low rates until they progress. No page-view tracking or third-party analytics. | One source of truth; no cookies or consent banner needed. |

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
| **Kobo** | 1/100 of a Naira; the unit all money is stored in. |
| **Deposit / balance** | The upfront part of a custom-order quote paid before production, and the remainder paid before completion. |

---

## 15. Reference Documentation

- Next.js — https://nextjs.org/docs
- Prisma — https://www.prisma.io/docs/
- Auth.js — https://authjs.dev
- Zod — https://zod.dev
- shadcn/ui — https://ui.shadcn.com
- Vercel CLI — https://vercel.com/docs/cli
- Vercel Blob — https://vercel.com/docs/storage/vercel-blob
- Paystack — https://paystack.com/docs
- Playwright — https://playwright.dev
- Cursor — https://cursor.com/docs
- GitHub Actions — https://docs.github.com/en/actions
