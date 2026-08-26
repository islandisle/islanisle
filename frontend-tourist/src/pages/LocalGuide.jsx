import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getLocalEvents } from '../api/client';

// Batch 19 — "local knowledge": events calendar (dynamic, admin-managed —
// see frontend-admin's LocalEventsSection), plus visa/customs/SIM and
// tipping guidance. The guidance sections are static reference content
// (general Maldives entry rules, not per-nationality visa lookup — that
// would need a real visa-rules API/dataset this environment doesn't have),
// consistent with EmergencyContacts.jsx's own similar scoping.
export default function LocalGuide() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const island = searchParams.get('island') || '';
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getLocalEvents(island || undefined)
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err.message));
  }, [island]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>
        Local guide
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        {island ? `Good to know for ${island} and the Maldives generally.` : 'Good to know before and during your trip.'}
      </p>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
          Upcoming events{island ? ` — ${island}` : ''}
        </p>
        {error && <p className="error-text">{error}</p>}
        {!events && !error && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>}
        {events && events.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing scheduled right now.</p>
        )}
        {events && events.map((e) => (
          <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>{e.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              {new Date(e.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {e.island ? ` · ${e.island}` : ' · Maldives-wide'}
            </p>
            {e.description && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{e.description}</p>
            )}
          </div>
        ))}
      </div>

      <GuideSection title="Visa & customs">
        <p>
          Most nationalities receive a free 30-day tourist visa on arrival — no advance
          application needed. You'll need: a passport valid for at least 1 month beyond your
          stay, proof of onward travel, and confirmed accommodation for your first night.
        </p>
        <p>
          Importing alcohol, pork products, and items considered contrary to Islamic values
          (including some religious/idol items) is restricted — these are confiscated and
          held for collection on departure if brought in.
        </p>
      </GuideSection>

      <GuideSection title="SIM cards & connectivity">
        <p>
          Tourist SIMs (Ooredoo and Dhiraagu, the two national carriers) are available at
          Velana International Airport on arrival, and at shops on most inhabited islands —
          bring your passport to register one. Guesthouses and resorts almost all offer
          Wi-Fi; coverage on transfers between islands can be patchy.
        </p>
      </GuideSection>

      <GuideSection title="Tipping & etiquette">
        <p>
          Tipping isn't obligatory (a service charge is often already included at
          guesthouses/restaurants) but is appreciated for good service — MVR 20–50 or a
          similar small USD amount for boat crews, housekeeping, or a guide is typical.
        </p>
        <p>
          Inhabited local islands are conservative — modest dress (shoulders/knees covered)
          is expected outside of designated "bikini beaches," and public displays of
          affection are best avoided.
        </p>
      </GuideSection>
    </div>
  );
}

function GuideSection({ title, children }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', marginBottom: 8 }}>{title}</p>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}
