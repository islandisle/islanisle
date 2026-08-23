# Atoll Isle — Tourist Frontend (Phase 1)

Vite + React, using the "Horizon Line" design system established earlier in
this conversation (the Visualizer mockups — header, weather line-art,
tap-to-toggle badge — before this was real code).

## What's built

- **Signup** — the exact Section 2.1 Phase 1 flow: Tourist/Local first,
  mandatory document upload, manual field entry, language step (Tourist
  only, skipped for Locals), optional travel group creation.
- **Login** — issues and stores the JWT from the backend.
- **Home** — island browsing, wired to the real `GET /api/islands/:island/listings`
  endpoint, with the established header treatment (wave-line/weather line-art
  behind the logo).
- **Listing detail + booking** — creates a real booking via
  `POST /api/bookings`, shows the price breakdown, and surfaces the Stripe
  `client_secret` the backend issues.

## Verification performed — and its real limits

**No JSX compiler is available in this sandbox** (no network access to
install Vite/Babel/esbuild), so these files were never actually compiled or
run here — unlike the backend, where `node --check` gave a real syntax
guarantee on every file.

What was actually done instead:
- `src/api/client.js` has no JSX — it **was** syntax-checked for real with
  `node --check` and passed.
- Every `.jsx` file was run through `check_jsx.py`, a hand-written
  structural checker (brace/paren/string balance + JSX tag balance). This
  is a real check, but not a full parser — it has two known false-positive
  patterns (documented in the script itself), both of which fired during
  this build and were manually verified to be non-issues by reading the
  flagged code.
- Every relative import path across all files was checked against the
  actual file tree — no broken imports.
- Every function imported from `api/client.js` was checked against what
  that file actually exports — no name mismatches.

**What this doesn't catch**: React-specific bugs (missing keys, hook rule
violations, prop type mismatches), CSS issues, or anything a real bundler's
error output would surface immediately. Run `npm install && npm run dev`
on your machine for the real first check — that's the genuine verification
this sandbox couldn't perform.

## What's not built

- Business and Admin frontends — this is tourist-only.
- Stripe Elements payment collection UI — the booking flow gets as far as
  showing the price breakdown and the `client_secret`; actually collecting
  card details and confirming payment isn't wired up yet.
- Profile/Settings page (linked from the header, route doesn't exist yet).
- The travel group QR display/scan popup (described in the script's Section
  2.2, not yet built as a component).
- Everything else described in the main script beyond direct booking.

## Local setup

```bash
cd frontend-tourist
npm install
npm run dev
```

Set `VITE_API_BASE` in a `.env` file if your backend isn't on
`http://localhost:4000`.
