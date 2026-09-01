# frontend-landing

The splitter site. Its only job: route a first-time visitor who doesn't
know which Atoll Isle app is theirs to the right one — traveller/local,
business, or travel agent. Not a marketing site.

- Vite + plain React, single static page, no router (outbound links only).
- Styling is `frontend-tourist`'s "Horizon Line" `theme.css`, copied verbatim.
- The three destination URLs come from `VITE_TOURIST_APP_URL` /
  `VITE_BUSINESS_APP_URL` / `VITE_AGENT_APP_URL` (see `.env.example`).
  Each card links to that app's `/signup` where one exists (tourist,
  agent) or `/login` (business).

There are exactly three cards by design — no fourth entry point belongs on
a public splitter, and other account types reach their app through it
(or through another app's login), never from here.

```
npm install
npm run dev      # http://localhost:5180
```
