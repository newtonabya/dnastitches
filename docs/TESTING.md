# Acceptance test script

A complete hands-on test of DNA Stitches on the live site, as the studio (two admins) and as
customers (ten people, each in a different situation). Work through it top to bottom: later steps
use what earlier steps created. Tick each box as you go and note anything odd in the results log at
the end.

It takes about half a day. You can stop after any numbered section and carry on later.

---

## 0. Before you start

### 0.1 Settings to check in Vercel

- [ ] **Paystack test keys.** `PAYSTACK_SECRET_KEY` starts with `sk_test_` and
      `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` starts with `pk_test_`. **Never run this script with live
      keys:** real cards would be charged.
- [ ] **Both admin emails** (from the cast list below) are in `ADMIN_EMAILS`, comma-separated,
      e.g. `you+dna-admin1@gmail.com,you+dna-admin2@gmail.com`. Redeploy after changing it.
- [ ] **Resend sends from your own verified domain** (`EMAIL_FROM` = `DNA Stitches <hello@yourdomain.com>`).
      With Resend's test sender `onboarding@resend.dev`, only your Resend sign-up address
      receives mail, so the twelve test accounts below wouldn't get their sign-in links.
- [ ] **Paystack webhook** is set to `https://<your-site>/api/webhooks/paystack` in Paystack
      → Settings → API Keys & Webhooks (test mode).
- [ ] Optional, only if you'll test them: `SENDBOX_API_KEY` + `COURIER_ORIGIN_*` (courier, C10)
      and `TERMII_API_KEY` + `TERMII_SENDER_ID` (text reminders, C9).

### 0.2 Email addresses: one inbox for everyone

Gmail (and most providers) deliver `you+anything@gmail.com` to `you@gmail.com`. Put the `+tag`
**before the `@`**, in place of your address. For example, if your email is `ada@gmail.com`:

| Account | Type this                  | Not this                                 |
| ------- | -------------------------- | ---------------------------------------- |
| Admin A | `ada+dna-admin1@gmail.com` | ~~`ada@gmail.com+dna-admin1@gmail.com`~~ |
| C3      | `ada+dna-c3@gmail.com`     |                                          |

Every test account's email then arrives in your one inbox, each signing in to a different
DNA Stitches account. Tip: in Gmail, search `to:ada+dna-c3` to see one customer's emails. In the
tables below, replace `you` with the part of your address before the `@`.

### 0.3 Browsers

Each account needs its own browser session. Use a normal window for **Admin A**, a **private /
incognito window for Admin B**, and a **second browser** (or another private window, after
signing out) for customers. Do the customer steps marked 📱 on a **phone**.

Sign-in links are limited to **5 per email address per 10 minutes**. If you see "Too many sign-in
emails", wait 10 minutes.

### 0.4 Paystack test card

On the Paystack test checkout, use the card **4084 0840 8408 4081**, any future expiry date, CVV
**408**. If Paystack asks for a PIN or OTP, use the values on Paystack's **Test Payments** page
(Paystack docs → Payments → Test Payments). To simulate a failed or abandoned payment, close the
Paystack window or press **Cancel** instead of paying.

### 0.5 The cast

**Admins**

| Who                            | Email                      | Role in the test                                                 |
| ------------------------------ | -------------------------- | ---------------------------------------------------------------- |
| **Admin A** (studio owner)     | `you+dna-admin1@gmail.com` | Sets up the shop, quotes, takes payments, ships                  |
| **Admin B** (studio assistant) | `you+dna-admin2@gmail.com` | Appointments, repairs, reviews; tests two admins working at once |

**Customers.** Phones are dummy numbers in the right format. Only C9 uses **your real phone**,
and only if text reminders are on.

| #   | Name         | Email                   | Phone               | Address (state)                      | Situation                                                                                       |
| --- | ------------ | ----------------------- | ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| C1  | Ada Okafor   | `you+dna-c1@gmail.com`  | 0803 100 0001       | 12 Admiralty Way, Lekki (Lagos)      | Buys a piece **with delivery**, reviews it, reports a defect that's repaired                    |
| C2  | Bola Adeyemi | `you+dna-c2@gmail.com`  | 0803 100 0002       | none: pickup only                    | Buys a piece **for pickup**, defect report **rejected**                                         |
| C3  | Chidi Nwosu  | `you+dna-c3@gmail.com`  | 0803 100 0003       | 5 Allen Avenue, Ikeja (Lagos)        | **Full custom order**, paid online: deposit then balance, fitting, delivery, review             |
| C4  | Damilola Ojo | `you+dna-c4@gmail.com`  | 0803 100 0004       | none                                 | **Custom order paid in cash** (recorded by the admin), pickup                                   |
| C5  | Efe Okoro    | `you+dna-c5@gmail.com`  | 0803 100 0005       | 3 Ring Road, Benin City (Edo)        | Wants a **sold-out** piece: notify-me, then the **restock email**, then buys                    |
| C6  | Funke Bello  | `you+dna-c6@gmail.com`  | 0803 100 0006       | none                                 | Races C7 for the **last piece** and wins                                                        |
| C7  | Gozie Eze    | `you+dna-c7@gmail.com`  | 0803 100 0007       | none                                 | **Loses the race**; later **abandons** a payment                                                |
| C8  | Halima Musa  | `you+dna-c8@gmail.com`  | 0803 100 0008       | none                                 | **Consultations**: books, moves, cancels; another one marked **no-show**                        |
| C9  | Ifeoma Uche  | `you+dna-c9@gmail.com`  | **your real phone** | 9 Aminu Kano Crescent, Wuse II (FCT) | **Profile and measurements**: validation, versions, cm/in, text reminders, out-of-zone delivery |
| C10 | Jide Balogun | `you+dna-c10@gmail.com` | 0803 100 0010       | 7 Bode Thomas St, Surulere (Lagos)   | **Cancels a custom order after deposit** (forfeit), **security checks**, **courier** tracking   |

### 0.6 Test data Admin A will create (section A2)

| Item                               | Details                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Delivery zone **TEST Lagos**       | States: Lagos · Fee ₦3,500 · 2 days · Active                              |
| Delivery zone **TEST South-South** | States: Edo, Delta, Rivers · Fee ₦7,000 · 4 days · Active                 |
| Booking hours                      | Mon–Fri 10:00–17:00, Sat 10:00–14:00                                      |
| Swatch **TEST Gold Aso-oke**       | Any colour, available for custom requests                                 |
| Product **TEST Adire Wrap Dress**  | ₦120,000 · quantity 2 · published (C1, C2)                                |
| Product **TEST Ankara Midi**       | ₦85,000 · quantity 1 · published (C6 vs C7 race)                          |
| Product **TEST Lace Kaftan**       | ₦150,000 · quantity 0 (sold out) · published (C5)                         |
| Product **TEST Silk Two-piece**    | ₦95,000 · quantity 1 · published (C7 abandoned payment, then C10 courier) |
| Portfolio **TEST Bridal Gown**     | Tags: `bridal, hero` · published                                          |

Everything is prefixed **TEST** so it's easy to find and remove afterwards (section 4).

---

## Part A: Admin story

### A1. Access and dashboard (Admin A, then Admin B)

- [ ] Open the site, **Sign in** with `you+dna-admin1@gmail.com`. The email arrives from your
      domain within a minute; the link signs you in.
- [ ] The header shows **Admin**. Open it: the **Dashboard** shows "Custom orders in progress"
      (all 0) and "Needs attention" (all 0).
- [ ] The admin menu has Dashboard, Orders, Appointments, Clients, Products, Swatches, Portfolio,
      Repairs, Reviews, Analytics, Settings.
- [ ] In the private window, sign in as **Admin B** (`you+dna-admin2@gmail.com`). Admin B also
      sees **Admin**.
- [ ] Sign out as Admin B, sign in as **any customer email** (e.g. C1): there is **no Admin** link,
      and typing `/admin` in the address bar does **not** open the admin. Sign out again.

### A2. Shop setup (Admin A)

**Settings**

- [ ] **Settings → Delivery zones:** if there are zones named `PLACEHOLDER — …`, deactivate them.
      Add **TEST Lagos** and **TEST South-South** (table 0.6). Both show as Active with their fees.
- [ ] Try adding a zone with a negative fee: it's refused with a message.
- [ ] **Settings → Booking hours:** add the hours from table 0.6. Try **From 17:00, To 10:00**:
      "End must be after start". Then add them correctly.
- [ ] **Block a date:** block a weekday about 10 days from now with reason "TEST holiday". It
      appears under Blocked dates.

**Catalog**

- [ ] **Swatches → Add a swatch:** **TEST Gold Aso-oke**, with an image, Available for custom
      requests → **Save swatch**.
- [ ] **Products → New:** create the four products in table 0.6, each with 1–3 photos, fabric
      composition, care instructions and measurements, Published ticked → **Save product**. Photos
      upload and appear; the product list shows all four.
- [ ] Open **TEST Silk Two-piece** and reorder its images; save; the order sticks.
- [ ] **Portfolio → Add a portfolio item:** **TEST Bridal Gown**, a strong photo (ideally the
      woman in the gold gown), tags `bridal, hero`, Published → **Save item**.
- [ ] Open the **home page**: the hero shows the TEST Bridal Gown photo behind the crest
      (it can take a few minutes to refresh).
- [ ] Open the **Shop**: the four TEST pieces show. Badges: Adire Wrap Dress **Available**
      (quantity 2), Ankara Midi and Silk Two-piece **Last One** (quantity 1), Lace Kaftan
      **1-of-1 · Sold** and greyed.

Now hand over to the customer stories (Part B) for C1 to C10. The admin halves of those
stories are marked **Admin A** / **Admin B** there. Come back to A3 to A9 afterwards.

### A3. Two admins at once (Admin A and Admin B)

Do this after C3 has submitted a custom request (B3), with both admins signed in.

- [ ] Both admins open the **same custom order** (Orders → Pipeline → C3's card).
- [ ] Admin A changes the status (Change status → next status → **Update status**).
- [ ] **Without refreshing**, Admin B tries a different status change on the same page: it's
      **refused** with a message that the order changed in the meantime. After refreshing, Admin B
      sees Admin A's change.
- [ ] Both admins add **Private notes** (different text) and **Save notes**; the last save wins
      and nothing crashes.

### A4. Clients (Admin A)

- [ ] **Clients:** search "Chidi", then "you+dna-c3": C3 is found both ways.
- [ ] Open C3's profile: their custom order, appointments and measurements are listed.
- [ ] Open C4's profile → record measurements on their behalf (**Save measurements (taken by
      atelier)**). C4 later sees them in **My measurements**, marked as taken by the atelier.

### A5. Notify-me export and restock (Admin A)

Do this after C5's notify-me (B5).

- [ ] Products → **TEST Lace Kaftan** → the **Notify-me requests** section lists C5's email and
      request type(s).
- [ ] **Export CSV** downloads a file that opens in Excel or Sheets, with C5's row.
- [ ] Set the quantity to **1** and **Save product**: the message says **"Saved. Emailing 1
      people who asked to hear when it's back."** Save again: nobody is emailed twice.

### A6. Repairs (Admin B)

Do this after C1 and C2 report defects (B1, B2).

- [ ] **Repairs** lists both as Open; the dashboard's "Open repairs" shows 2.
- [ ] C1's repair: **Move to In repair** → add a note → later mark it resolved. C1 is emailed at
      each change.
- [ ] C2's repair: **Move to Not covered** with the reason "Damage occurred after handover".
      C2 is emailed and sees the reason in My Wardrobe.

### A7. Reviews (Admin B)

Do this after C1 and C3 leave reviews.

- [ ] **Reviews → To approve** lists both; the dashboard shows "Reviews to approve: 2".
- [ ] **Approve** C1's 5-star review: it appears on the product page and in "What our clients say"
      on the home page.
- [ ] **Hide** C3's review: it doesn't appear anywhere public; it's listed under **Hidden**.
      Approve it again from Hidden: it now appears.

### A8. Analytics (Admin A)

Do this at the very end.

- [ ] **Analytics → Last 30 days:** Total received includes the online and cash payments made in
      this test; Shop sales and Custom orders add up to the total; "Cash or transfer" shows C4's
      payments.
- [ ] The **Last 12 months** chart shows a bar for this month; hover or tab to it for the amount;
      **Show as a table** lists the same figure.
- [ ] Custom orders funnel: Received includes C3, C4 and C10; C10 shows under Cancelled.
- [ ] Most wanted: TEST Lace Kaftan appears while a notify-me request is still waiting.
- [ ] Appointments: counts by type and a no-show (from C8).
- [ ] Switch to **All time**: figures are the same or higher.

### A9. Phone check for admins 📱

- [ ] Open Admin on a phone: the admin menu scrolls sideways; orders, products and the
      appointment list are usable; the bottom tab bar does **not** show inside Admin.

---

## Part B: Customer stories

Each story says who acts. **Sign in as the customer** in the customer browser; do the
**Admin A / Admin B** steps in that admin's window.

### B1. C1 Ada: buys with delivery, reviews, gets a repair

1. **Sign up and profile**
   - [ ] Sign in with `you+dna-c1@gmail.com`. The email arrives; the link signs you in.
   - [ ] **Profile:** name "Ada Okafor", phone `0803 100 0001` → **Save profile**: "Profile saved."
   - [ ] **Add an address:** recipient Ada Okafor, phone, `12 Admiralty Way`, city Lekki, state
         Lagos → **Add address**. It's marked **Default**.
2. **Shop**
   - [ ] Shop → filter **Available**: only in-stock pieces. **Sold Out**: only Lace Kaftan. Back to
         **All**.
   - [ ] Open **TEST Adire Wrap Dress**: photos, price, composition, care, measurements. Switch
         **cm / in**: numbers convert.
3. **Checkout with delivery**
   - [ ] **Buy Now** → choose **Deliver to me** → the address shows **₦3,500 · TEST Lagos ·
         usually 2 days** (or a "Sendbox …" price if the courier is on). Total = ₦123,500.
   - [ ] **Pay** stays disabled until you tick the **all sales are final** box.
   - [ ] Pay with the test card → you land on **"Thank you! TEST Adire Wrap Dress is yours."**
   - [ ] Email: **"Order confirmed: TEST Adire Wrap Dress"** arrives.
   - [ ] **My Wardrobe** lists the piece as **Paid**.
   - [ ] **Admin A:** Orders → **Shop orders** shows it as **Paid: to fulfil**, with C1's address.
         The Shop now shows Adire Wrap Dress as **Last One** (1 left).
4. **Delivery**
   - [ ] **Admin A:** press **Mark as delivered**. It shows **Fulfilled** with today's date.
   - [ ] C1's My Wardrobe shows **Collected / delivered**, with **Report a defect** and
         **Leave a review**.
5. **Review**
   - [ ] **Leave a review:** 5 stars, "Beautiful finish, fits perfectly", name to show "Ada O." →
         **Submit review**. It shows as waiting for approval.
   - [ ] Try to review the same piece again: not offered.
   - [ ] Continue at **A7** for approval.
6. **Repair**
   - [ ] **Report a defect:** "A seam opened at the left side", 1–3 photos → **Send report**.
         Uploading a 4th photo is refused.
   - [ ] Continue at **A6** (Admin B moves it to In repair, then resolves it). C1 is emailed at
         each step and My Wardrobe shows the status.

### B2. C2 Bola: pickup, defect rejected

- [ ] Sign in as C2, no address. Buy **TEST Adire Wrap Dress** (the last one). At checkout,
      **Deliver to me** says to add an address; choose **Pick up from the studio**: the studio
      address and hours show; total ₦120,000.
- [ ] Pay → success page. The Shop now shows Adire Wrap Dress as **1-of-1 · Sold**, greyed, with
      **Request Custom Version** instead of Buy Now.
- [ ] **Admin A:** Shop orders → **Mark as picked up** → Fulfilled.
- [ ] C2: **Report a defect** → "Stain on the front" → Send report.
- [ ] Continue at **A6**: Admin B rejects it with a reason. C2 sees **Not covered** and the reason.

### B3. C3 Chidi: full custom order, paid online

1. **Request**
   - [ ] Sign in as C3; add the Ikeja address.
   - [ ] **Portfolio:** filter by tag **bridal** → on TEST Bridal Gown press **I want something like
         this** (or Tailoring → **Start a custom request**).
   - [ ] Stepper: Title "Wedding agbada", a description, budget ₦400,000, occasion Wedding.
         Set a **target date 5 days away**: it's refused (minimum lead time 14 days). Set it 30 days
         away instead.
   - [ ] Fabric: choose **TEST Gold Aso-oke**.
   - [ ] Measurements: tick **Book a measurement appointment instead**.
   - [ ] Add 2 reference photos (a 6th photo is refused: up to 5) → **Submit request**.
   - [ ] You see the order reference (e.g. DNA-2026-0001); an email confirms it.
   - [ ] My Wardrobe shows it with a progress bar at **Request received (5%)**.
   - [ ] **Admin A:** the dashboard shows 1 under Request received and "New requests to triage".
         Do **A3** now (two admins), then continue.
2. **Consultation**
   - [ ] C3: Tailoring → **Book a consultation** → In the studio → pick a day 2+ days away and a
         time → **Request appointment** → "We've emailed you the details".
   - [ ] **Admin B:** **Appointments** → the week calendar shows it → open it → **Confirm**. C3
         receives a confirmation with a calendar invite (.ics) that opens in a calendar app.
3. **Measurements and quote**
   - [ ] **Admin A:** move the order to **Measurements taken**. Try moving straight to **In
         production**: refused (no deposit yet).
   - [ ] **Quote:** price ₦380,000, delivery fee pre-filled with ₦3,500 (TEST Lagos), deposit
         pre-filled at 50% (₦190,000) → **Save and send quote**. The status becomes **Awaiting
         deposit**; C3 is emailed the quote.
4. **Deposit (online)**
   - [ ] C3: My Wardrobe → the order shows the quote, deposit and balance → **Pay deposit**. The
         non-refundable/final-sale box must be ticked first.
   - [ ] Pay with the test card → "Payment received. Thank you!" The status moves to **In
         production** by itself, and both C3 and the studio get an email.
   - [ ] **Admin A:** Status history shows the change made by the system; balance due ₦193,500.
5. **Fitting**
   - [ ] **Admin A:** **Book an appointment** on the order → Type **Fitting**, a date 5+ days away,
         a time, 30 minutes → **Book and email the customer**. "Booked. The customer has been
         emailed an invite."
   - [ ] Open the fitting: **Confirmed**, with **Reminder emails** at 48 h and 3 h before.
   - [ ] C3 sees it under My account → Appointments.
6. **Ready and balance**
   - [ ] **Admin A:** move to **Fitting**, then **Ready**. Try **Completed**: refused (balance
         still due).
   - [ ] C3: **Pay balance** → pay ₦193,500 with the test card → balance due ₦0.
7. **Delivery and completion**
   - [ ] If the courier is on: **Admin A** books it from the **Courier** panel (see B10 step 4).
         Otherwise **Admin A** moves the order to **Completed**.
   - [ ] C3's progress bar shows **100%**; a completion email arrives.
8. **Review**
   - [ ] C3: **Leave a review** (4 stars) → Submit. Continue at **A7**.

### B4. C4 Damilola: custom order paid in cash

- [ ] C4: submit a custom request "Office suits x2", target date 20 days away, **Not sure** about
      fabric, book a measurement appointment instead.
- [ ] **Admin A:** move to Measurements taken; record measurements for C4 (see **A4**); send a
      quote of ₦200,000, delivery fee ₦0 (pickup), deposit ₦100,000.
- [ ] **Admin A:** **Record offline payment:** ₦100,000, note "Cash at studio" → **Record
      payment**. The deposit counts: you can now move the order to **In production**.
- [ ] C4's My Wardrobe shows the deposit as paid, and the balance ₦100,000.
- [ ] **Admin A:** later, record the balance offline (₦100,000) → Ready → **Completed**.
- [ ] C4 sees **Completed** and can leave a review.

### B5. C5 Efe: sold-out piece, restock email

- [ ] Signed out, open **TEST Lace Kaftan** (sold out): it offers **Request Custom Version** and
      **Notify me**.
- [ ] Enter `you+dna-c5@gmail.com`, keep **Restock / similar piece**, also tick **Similar fabric**
      → **Notify me**. A confirmation shows. Submitting the same email again doesn't create a
      duplicate.
- [ ] Continue at **A5** (Admin A restocks it).
- [ ] C5 receives **"It's back: TEST Lace Kaftan"** with a link. Only one email arrives.
- [ ] C5 signs in, adds the Benin City (Edo) address, buys with **delivery**: the fee is
      **₦7,000 · TEST South-South · usually 4 days**. Pay → success.

### B6 and B7. C6 Funke vs C7 Gozie: race for the last piece

Use two separate browsers side by side, C6 in one and C7 in the other.

- [ ] Both open **TEST Ankara Midi** (Last One) and press **Buy Now**; both reach checkout with
      Pickup.
- [ ] **C6** ticks the box and presses **Pay** first, and is sent to Paystack. Don't pay yet.
- [ ] **C7** now presses **Pay**: the message **"This piece was just claimed."** appears. C7
      can't pay for it.
- [ ] C6 completes payment → success. C7 refreshes the product: **1-of-1 · Sold**.

**C7 abandons a payment**

- [ ] C7 opens **TEST Silk Two-piece** → Buy Now → Pickup → Pay → on Paystack, **cancel or close**.
- [ ] C7 lands on **"Payment not completed"**. My Wardrobe doesn't list a paid order.
- [ ] For the next **15 minutes** the piece is held: another customer pressing Pay sees "This piece
      was just claimed". **After 15 minutes**, it can be bought again (C10 buys it in B10).

### B8. C8 Halima: consultations

- [ ] C8: Tailoring → **Book a consultation** → **Video call** → a day 3+ days away → a time →
      **Request appointment** → "We've emailed you the details". It shows as **Requested** in My
      account → Appointments.
- [ ] Days without hours (Sunday) and the **blocked date** from A2 aren't offered; nothing in the
      next 24 hours is offered.
- [ ] **Move** it to another time (**Choose a new time** → **Move appointment**): "Your
      appointment has moved." A new email and invite arrive.
- [ ] **Cancel** it → **Yes, cancel it** → "Appointment cancelled." It moves to **Past and
      cancelled**. Admin B's list shows it cancelled.
- [ ] Book another consultation (in studio). **Admin B:** **Confirm** it. Try **Mark completed**
      before it starts: not offered.
- [ ] **Admin B:** **Reschedule** it to tomorrow. C8 is emailed. C8 can no longer **Move** or
      **Cancel** it online (under 24 hours away); the page says to contact the studio.
- [ ] After the appointment time has passed, **Admin B** marks it **No-show**. It counts in
      Analytics (A8).

### B9. C9 Ifeoma: profile, measurements, text reminders, out-of-zone

- [ ] Profile: enter phone `12345` → refused with a message. Enter your real phone → saved and
      shown in Nigerian format.
- [ ] Tick **text reminders** without a phone (clear it first): refused ("add a phone number").
      With the phone: saved.
- [ ] **My measurements:** add a profile "Everyday" with **Centimetres (cm)** (bust, waist, hips,
      length) → **Save measurements**. Try an impossible value first (bust 500): refused.
- [ ] Edit it → **Save new version**: the earlier version is kept in the history. Add a second
      profile "Heels" and **set it as default**.
- [ ] Add the Wuse II address, state **FCT**. At checkout with delivery, that address is marked
      **no delivery** (no zone covers FCT) and only pickup is possible, unless the courier is on,
      in which case a Sendbox price shows.
- [ ] If text reminders are on: **Admin A** books C9 a **pickup** appointment 2–3 days away. 48
      hours before, your phone gets a text **and** C9 gets an email. (Or check the appointment's
      **Reminder emails/texts** list in Admin: an SMS line is listed.)

### B10. C10 Jide: cancellation with forfeit, security, courier

1. **Security**
   - [ ] Signed in as C10, open `/admin`: no access.
   - [ ] Paste the address of **C3's** My Wardrobe order page (copy it from C3's session): C10
         gets "not found", never C3's details.
   - [ ] Open `/custom/book?reschedule=not-mine`: "This appointment can't be moved online".
2. **Cancel after deposit**
   - [ ] C10 submits a custom request; **Admin A** quotes ₦150,000 / deposit ₦75,000; C10 pays the
         deposit online.
   - [ ] **Admin A:** change status to **Cancelled**: a warning says the deposit is
         **non-refundable** and must be confirmed. Confirm. C10 is emailed; My Wardrobe shows
         **Cancelled**; no refund is created.
3. **Buy with delivery**
   - [ ] After C7's 15-minute hold has expired, C10 buys **TEST Silk Two-piece** with delivery to
         the Surulere (Lagos) address and pays.
4. **Courier** (only if Sendbox is configured)
   - [ ] **Admin A:** Shop orders → **Courier & tracking** → the Courier section lists Sendbox
         options with prices, and what C10 paid for delivery.
   - [ ] Choose one → **Book courier** → a banner shows the tracking number (or says the booking is
         **on hold**: top up your Sendbox wallet). C10 receives **"On its way"** with the tracking
         number.
   - [ ] Pressing **Book courier** again isn't possible: the form is gone once booked.
   - [ ] C10's My Wardrobe shows the courier, status and tracking number.
   - [ ] **Check tracking now** updates the history. When Sendbox reports **Delivered**, the order
         becomes **Fulfilled** by itself and C10 gets a "Delivered" email.

---

## Part C: Across the whole site

- [ ] 📱 **Phone, signed out:** home page (crest, "According to Ur DNA", two big panels); bottom
      tab bar **Home · Shop · Tailoring · Profile** with the current tab in gold; Shop shows **two
      pieces per row** and the **Book a Bespoke Fitting** banner.
- [ ] 📱 **Phone, add to home screen:** the icon is the gold DS monogram on black.
- [ ] **Keyboard only** (desktop): Tab through the home page and checkout; every link and button
      shows a visible focus ring; Enter activates it.
- [ ] **Policies:** `/policies/terms` loads and states: all sales final, deposits non-refundable,
      defects repaired free within 7 days.
- [ ] **Sign out** works from every page; afterwards My Wardrobe asks you to sign in.
- [ ] **Scheduled jobs:** GitHub → Actions → **Reminders** → **Run workflow** → it goes green.
- [ ] **Emails:** every email in this script came from your domain, not `onboarding@resend.dev`,
      and none went to spam (if some did, mark them "Not spam" and check your domain's DNS
      records in Resend).

---

## 4. Cleaning up afterwards

- [ ] Products: unpublish or set each **TEST** product to quantity 0. Orders and payments are kept
      for the records; they were test-mode payments, so no money moved.
- [ ] Portfolio: unpublish **TEST Bridal Gown** (or keep it if it's a real photo you want).
- [ ] Swatches: mark **TEST Gold Aso-oke** unavailable.
- [ ] Settings: deactivate the **TEST** delivery zones, remove the **TEST holiday** blocked date,
      and set your real zones and hours.
- [ ] Reviews: **Hide** the test reviews so they don't show as testimonials.
- [ ] Vercel: keep Paystack **test** keys until you're ready to take real money; switching to
      live keys is the last step in `docs/LAUNCH.md`.

---

## Results log

| Step | Pass / Fail | What happened (if it failed) | Screenshot? |
| ---- | ----------- | ---------------------------- | ----------- |
|      |             |                              |             |
|      |             |                              |             |
|      |             |                              |             |
