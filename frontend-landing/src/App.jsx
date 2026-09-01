import { useState } from 'react';
import './styles/landing.css';
import { AmbientBackground } from './components/AmbientBackground';
import { LeafBackdrop } from './components/LeafBackdrop';

// The three destination apps. URLs come from env vars — read exactly the
// way frontend-tourist/src/api/client.js reads VITE_API_BASE: an
// `import.meta.env.VITE_*` lookup with a localhost dev default as the
// fallback. The defaults match each app's now-pinned dev port (see each
// app's vite.config.js — port floating by start order was the bug that
// sent every card to whichever app happened to be running on 5173).
// Deployment overrides all three via .env with real URLs and no code
// change here.
const stripTrailingSlash = (url) => url.replace(/\/+$/, '');

const TOURIST_APP_URL = stripTrailingSlash(import.meta.env.VITE_TOURIST_APP_URL || 'http://localhost:5173');
const BUSINESS_APP_URL = stripTrailingSlash(import.meta.env.VITE_BUSINESS_APP_URL || 'http://localhost:5174');
const AGENT_APP_URL = stripTrailingSlash(import.meta.env.VITE_AGENT_APP_URL || 'http://localhost:5175');

// One card per audience, styled as a boarding-pass stub — `code` is the
// ticket's route code, in the spirit of a real boarding pass or bill of
// lading. `getStartedHref` / `loginHref` are separate because the apps
// differ: frontend-tourist and frontend-agent each have a distinct
// /signup route (checked in their App.jsx), frontend-business has only
// /login (a business is attached to an existing account — see its
// Login.jsx). These three are the whole list on purpose — there is
// deliberately no fourth entry point here and none should be added
// (see landing-splitter-brief.md — admin has no place on a public page).
const DESTINATIONS = [
  {
    key: 'tourist',
    code: 'TRV · TRAVELLER OR LOCAL',
    title: "I'm visiting or living in Maldives",
    blurb: 'Book stays, tables, excursions, transfers, and shop deliveries. Tourist and local accounts both use this app.',
    loginLabel: 'Traveller or local login',
    getStartedHref: `${TOURIST_APP_URL}/signup`,
    loginHref: `${TOURIST_APP_URL}/login`,
  },
  {
    key: 'business',
    code: 'OPS · BUSINESS OPERATOR',
    title: 'I run a business in Maldives',
    blurb: 'Manage listings, bookings, and payouts for a guesthouse, restaurant, excursion, transfer, or shop.',
    loginLabel: 'Business login',
    getStartedHref: `${BUSINESS_APP_URL}/login`,
    loginHref: `${BUSINESS_APP_URL}/login`,
  },
  {
    key: 'agent',
    code: 'AGT · TRAVEL AGENT',
    title: "I'm a travel agent",
    blurb: 'Book and manage trips for your clients, and track the commission you earn on them.',
    loginLabel: 'Travel agent login',
    getStartedHref: `${AGENT_APP_URL}/signup`,
    loginHref: `${AGENT_APP_URL}/login`,
  },
];

// Faint bathymetric contour lines — a nautical chart's depth rings around
// an atoll, not a decorative pattern. Purely static texture.
function ChartLines() {
  return (
    <svg className="landing-chart" viewBox="0 0 900 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <ellipse className="landing-chart-line" cx="700" cy="120" rx="260" ry="160" />
      <ellipse className="landing-chart-line" cx="700" cy="120" rx="360" ry="230" />
      <ellipse className="landing-chart-line" cx="700" cy="120" rx="460" ry="300" />
      <ellipse className="landing-chart-line" cx="120" cy="560" rx="220" ry="140" />
      <ellipse className="landing-chart-line" cx="120" cy="560" rx="320" ry="210" />
      <path className="landing-chart-line" d="M -50 350 Q 250 280 450 380 T 950 340" />
      <path className="landing-chart-line" d="M -50 420 Q 250 360 450 450 T 950 410" />
    </svg>
  );
}

export default function App() {
  // The top-bar "Log in" control just reveals the same three destinations
  // as login links — returning users of any type skip the ticket cards
  // below entirely. Local state, not a route (this page has no router).
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="landing">
      {/* Same shared background components as every other app in the
          product — landing.css now uses the same Horizon Line tokens, so
          no scoped colour overrides are needed for these. */}
      <AmbientBackground type="all" />
      <LeafBackdrop />
      <ChartLines />

      <div className="landing-inner">
        <header className="landing-header">
          <div className="landing-wordmark">
            <img src="/icon.svg" alt="" width={30} height={30} />
            <span>Atoll Isle</span>
          </div>
          <button
            type="button"
            className="landing-login-btn"
            onClick={() => setLoginOpen((open) => !open)}
            aria-expanded={loginOpen}
          >
            Log in
          </button>
        </header>

        {loginOpen && (
          <div className="landing-login-panel">
            <p>Log in to your existing account</p>
            {DESTINATIONS.map((d) => (
              <a key={d.key} href={d.loginHref} className="landing-login-link">
                <span>{d.loginLabel}</span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        )}

        <div className="landing-hero">
          <p className="landing-hero-eyebrow">1,192 islands · one crossing point</p>
          <h1>Which route is yours?</h1>
          <p>
            Atoll Isle connects travellers, businesses, and travel agents across the
            Maldives. Pick your route below — each one opens its own app.
          </p>
        </div>

        <div className="landing-routes">
          {DESTINATIONS.map((d, i) => (
            <a
              key={d.key}
              href={d.getStartedHref}
              className="landing-ticket"
              style={{ animationDelay: `${0.28 + i * 0.08}s` }}
            >
              <p className="landing-ticket-code">{d.code}</p>
              <p className="landing-ticket-title">{d.title}</p>
              <p className="landing-ticket-blurb">{d.blurb}</p>
              <div className="landing-ticket-stub">
                <span style={{ fontSize: 12, color: 'var(--landing-text-secondary)' }}>Get started</span>
                <span className="landing-ticket-route" aria-hidden="true" />
                <span className="landing-ticket-arrow">→</span>
              </div>
            </a>
          ))}
        </div>

        <p className="landing-footnote">
          Already booked something? Use the login link at the top instead of signing up again.
        </p>
      </div>
    </div>
  );
}
