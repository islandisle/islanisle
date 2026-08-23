# Atoll Isle — Phase 1 Backend

A real, working backend for the app described in the full script, built
against the **Phase 1 (MVP) build order** (script Section 13.1). Building the
complete app (three frontends, 44 tables, escrow payments, OCR, weather
system, admin console) is a multi-month project — this is the backend
foundation, done properly, not a shortcut version of the whole thing.

## Status: Phase 1 (MVP) backend is functionally complete

Every backend item in the script's Phase 1 build order is built, except #15
which needs no backend code. **No frontend exists yet** — see below.

| # | Script item | Endpoint(s) |
|---|---|---|
| 1 | Signup, travel groups, language | `POST /api/auth/signup`, `POST /api/auth/login`, `GET/POST /api/groups/*` |
| 2 | Island/listing browsing | `GET /api/islands/:island/listings` |
| 3 | Business signup + listing CRUD | `POST /api/business/signup`, `/api/business/:id/listings` |
| 4 | Dual pricing | built into the booking engine |
| 5 | Booking engine, document gate, cancellation/refund | `POST /api/bookings`, `PATCH /api/bookings/:id/cancel` |
| 6 | Arrival Transfers | `GET /api/islands/arrivals` |
| 7 | Island Transfers | `GET /api/islands/transfers` |
| 8 | Business Settings | `GET/PATCH /api/business/:id/settings`, staff endpoints |
| 9 | Payments, escrow, invoices, payout history | `POST /api/payments/webhook`, `POST /api/payouts/run`, `GET /api/payouts/mine` |
| 10 | Notifications | `services/notifications.js` |
| 11 | Legal, account deletion, data export | `GET /api/terms`, `GET /api/account/export`, `POST /api/account/delete` |
| 12 | Admin console | `POST /api/admin/login`, approval queue, disputes |
| 13 | 2FA | `POST /api/2fa/setup`, `/confirm`, `/verify`, `/disable` |
| 14 | SOS button | `POST /api/sos` |
| 15 | First-run tour | frontend-only |

## What's here

```
atoll-isle/
├── database/schema.sql          44 tables, from script Section 12
├── backend/src/
│   ├── index.js                 Express app, all routes wired in
│   ├── config/{db,stripe}.js
│   ├── middleware/{auth,documentGate}.js
│   ├── services/{notifications,totp}.js
│   └── routes/
│       ├── auth.js              signup, login
│       ├── business.js          business signup, listing CRUD
│       ├── businessSettings.js  settings, staff accounts
│       ├── listings.js          browsing, arrivals, transfers
│       ├── bookings.js          booking engine, complete, cancel
│       ├── payments.js          Stripe webhook
│       ├── payouts.js           escrow-release payout run
│       ├── disputes.js          "Report a problem"
│       ├── admin.js             approval queue, suspend, disputes
│       ├── legal.js             terms, export, delete
│       ├── twoFactor.js         TOTP 2FA
│       └── sos.js               SOS/panic button
└── frontend-tourist/             (empty)
```

## Verification actually performed (not just "it should work")

- All 19 backend JS files pass `node --check`.
- Every table referenced in code (44 total) cross-checked against real
  `CREATE TABLE` statements — zero phantom tables.
- Every specific column used in the newest 8 route files checked one-by-one
  against the schema — zero typos or mismatches.
- **The TOTP 2FA implementation was validated against all 10 official RFC
  4226 test vectors** — produces the exact standard-defined codes for a known
  secret, not just "doesn't crash."
- A real bug was caught and fixed mid-build: the first version of
  `POST /api/bookings` marked bookings confirmed/escrow-held *before* payment
  happened. Fixed by adding a `pending_payment` status and moving
  confirmation to the Stripe webhook.
- Schema paren-balance and FK integrity re-verified after every edit.

**What can't be verified here**: an actual running server against live
Postgres/Stripe — this sandbox has no network access to `npm install` or
reach Neon/Stripe. That end-to-end test needs your machine.

## Known architectural gap — read before Phase 2 transfer features

Phase 2 tables (`group_bookings`, `package_deliveries`, `b2b_requests`)
reference a dedicated `routes` table, but Phase 1 speedboat listings are
generic `listings` rows with `type_specific_fields` JSONB instead —
**nothing syncs the two**. Fix this (sync logic, or refactor speedboat
booking to use `routes` directly) before building guesthouse-arranged
transfers or cross-island delivery matching.

## What's genuinely not here yet

- **All three frontends** — zero UI code. Visual mockups shown earlier in
  conversation were design concepts only, not connected to this backend.
- **Real timed slot-holds** — simple duplicate check only; needs a job
  scheduler or Redis TTL for the script's "held a few minutes, auto-releases"
  behavior.
- **A payout scheduler** — `/api/payouts/run` works when called, nothing
  calls it automatically yet.
- **Stale pending-payment cleanup** for abandoned/failed payments.
- **Real push delivery** (FCM/APNs) — the notification record is written,
  nothing sends an actual push yet.
- **Phase 2 entirely** — agents, weather, full group mechanics, QR
  check-in/boarding, B2B discounts, Pay at Visit, everything in Section 13.2.

## Frontend status

- **`frontend-tourist/`**: Signup (full Section 2.1 flow), Login, Home (island
  browsing), Listing detail + booking (up to the point of payment — Stripe
  Elements collection isn't wired up yet, on purpose, per your request to
  leave that for later), Profile (group management + personal/group QR
  popup, with a working manual-code-entry fallback since live camera
  scanning needs real device testing this sandbox can't do).
- **`frontend-business/`**: Login, business creation, listing CRUD, a manual
  "mark booking fulfilled" action wired to the real escrow-release endpoint.
- **`frontend-admin/`**: not started yet.

No JSX compiler is available in this sandbox (no network to install
Vite/Babel/esbuild) — see each frontend's own README for exactly how that
was verified instead (a hand-written structural checker plus manual
line-by-line tracing wherever it flagged something, with every false
positive's root cause identified rather than dismissed).

## Known TODO, left intentionally for later

- **Stripe Elements payment collection UI** — the booking flow creates a
  real PaymentIntent and shows the price breakdown, but doesn't collect
  card details yet. Backend is ready for this; just needs the frontend
  Stripe.js integration.

## Before production

- **File storage**: `saveDocumentImage()` in `auth.js` is a placeholder —
  plug in Cloudinary or S3-compatible storage.
- **Render tier**: free tier cold-starts after 15 min idle — budget for
  Starter before going live.
- Real `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` from your Stripe
  dashboard, and the Stripe CLI to forward webhook events locally during dev.

## Local setup

```bash
cd backend
cp .env.example .env        # fill in real DATABASE_URL, STRIPE keys
npm install
npm run dev
```

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

## Deployment

- **Neon**: create project, run `database/schema.sql` against it.
- **Render**: Web Service pointing at `backend/`, build `npm install`, start
  `npm start`, set `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` as env vars.
- **GitHub Pages**: each frontend gets its own static build once built.
