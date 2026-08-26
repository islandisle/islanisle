import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getIslandListings, sendSOS, getNotifications, getWeather } from '../api/client';
import IslandPicker from '../components/IslandPicker';
import FirstRunTour from '../components/FirstRunTour';
import { useLanguage } from '../i18n';

const DEFAULT_ISLAND = 'Maafushi';

// Script Section 4.9 / spec's business_type enum — used here to build the
// type filter pills. Kept in sync manually with backend/database/schema.sql
// (CREATE TYPE business_type) since there's no shared-constants file yet.
const BUSINESS_TYPES = ['guesthouse', 'restaurant', 'excursion', 'speedboat', 'shop'];

// Kept in sync manually with database/schema.sql's comment above
// listings.accessibility_features and frontend-business's
// ACCESSIBILITY_FEATURES (Dashboard.jsx) — same duplication pattern as
// BUSINESS_TYPES above (no shared-constants file yet).
const ACCESSIBILITY_FEATURES = [
  { key: 'wheelchair_accessible', label: 'Wheelchair accessible' },
  { key: 'step_free_access', label: 'Step-free access' },
  { key: 'accessible_bathroom', label: 'Accessible bathroom' },
  { key: 'elevator_available', label: 'Elevator available' },
  { key: 'braille_signage', label: 'Braille signage' },
  { key: 'hearing_loop', label: 'Hearing loop' },
  { key: 'service_animal_friendly', label: 'Service animal friendly' },
  { key: 'accessible_parking', label: 'Accessible parking' },
];

function getCurrentUser() {
  const raw = localStorage.getItem('atollisle_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function Home() {
  const [island, setIsland] = useState(DEFAULT_ISLAND);
  const [typeFilter, setTypeFilter] = useState('');
  const [accessibilityFilter, setAccessibilityFilter] = useState([]);
  const [showAccessibilityFilters, setShowAccessibilityFilters] = useState(false);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weather, setWeather] = useState(null);

  // Section 3.4 Pricing Visibility: a Local account should see local_price
  // everywhere prices are shown, not tourist_price. The backend has always
  // returned both fields (see backend/src/routes/listings.js) — this was
  // previously never read, so every account, tourist or local, saw the same
  // tourist price.
  const user = getCurrentUser();
  const isLocal = user?.type === 'local';
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getIslandListings(island, typeFilter || undefined, accessibilityFilter)
      .then((data) => {
        if (!cancelled) setListings(data.listings);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [island, typeFilter, accessibilityFilter]);

  function toggleAccessibilityFeature(key, checked) {
    setAccessibilityFilter((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
  }

  // Section 6.2: the header's line-art and tappable badge are meant to
  // reflect real conditions for the island currently selected, not be
  // purely decorative.
  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    getWeather(island)
      .then((data) => { if (!cancelled) setWeather(data.weather); })
      .catch(() => {}); // decorative — a failed fetch just means no badge/live icon, not an error banner
    return () => { cancelled = true; };
  }, [island]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Header island={island} weather={weather} />

      <div style={{ padding: 16 }}>
        {/* Section 3.2/11 "Choosing a Stay Island": searchable, grouped by
            atoll — not a curated island directory with photos/descriptions
            (that's a larger, separate piece), but a real picker rather than
            a plain text field. Reuses the same getIslandListings(island,
            type) call the backend already supports. */}
        <div style={{ marginBottom: 14 }}>
          <IslandPicker value={island} onChange={setIsland} id="home-island-picker" />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <FilterPill label={t('home.filter_all')} active={typeFilter === ''} onClick={() => setTypeFilter('')} />
          {BUSINESS_TYPES.map((type) => (
            <FilterPill
              key={type}
              label={t(`business_types.${type}`)}
              active={typeFilter === type}
              onClick={() => setTypeFilter(type)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAccessibilityFilters((v) => !v)}
          aria-expanded={showAccessibilityFilters}
          aria-controls="accessibility-filter-panel"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: showAccessibilityFilters ? 8 : 14,
            fontSize: 13,
            color: 'var(--lagoon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {t('home.accessibility_filters')}{accessibilityFilter.length > 0 ? ` (${accessibilityFilter.length})` : ''}
          <span aria-hidden="true">{showAccessibilityFilters ? '▲' : '▼'}</span>
        </button>

        {showAccessibilityFilters && (
          <div
            id="accessibility-filter-panel"
            role="group"
            aria-label="Filter listings by accessibility feature"
            className="card"
            style={{ padding: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {ACCESSIBILITY_FEATURES.map((feature) => (
              <label key={feature.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={accessibilityFilter.includes(feature.key)}
                  onChange={(e) => toggleAccessibilityFeature(feature.key, e.target.checked)}
                />
                {feature.label}
              </label>
            ))}
          </div>
        )}

        <Link
          to="/transfers"
          style={{
            display: 'inline-block',
            fontSize: 13,
            color: 'var(--lagoon)',
            textDecoration: 'none',
            marginBottom: 14,
          }}
        >
          {t('home.arriving_by_air')}
        </Link>

        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
          {t('home.whats_on', { island })}
        </p>

        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t('common.loading')}</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && listings.length === 0 && <EmptyState island={island} />}

        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} isLocal={isLocal} />
        ))}
      </div>

      <SOSButton island={island} />
      <FirstRunTour />
    </div>
  );
}

// Section 8.3 emergency/panic button. Deliberately a small fixed corner
// button — visible everywhere on Home but out of the way until tapped —
// rather than a banner or anything competing with normal browsing.
function SOSButton({ island }) {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState('');

  function handleClick() {
    if (status === 'sending') return;
    const confirmed = window.confirm('Send an SOS alert with your location?');
    if (!confirmed) return;

    setStatus('sending');
    setMessage('');

    if (!navigator.geolocation) {
      sendAlert(null, null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => sendAlert(position.coords.latitude, position.coords.longitude),
      // Still send the alert without coordinates rather than blocking on a
      // denied/unavailable location — an emergency alert with no location
      // beats none at all.
      () => sendAlert(null, null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function sendAlert(latitude, longitude) {
    try {
      const res = await sendSOS({ latitude, longitude, island });
      setMessage(res.message || 'Alert sent.');
      setStatus('sent');
    } catch (err) {
      setMessage(err.message);
      setStatus('error');
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={status === 'sending'}
        aria-label="Send SOS alert"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 16,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--coral)',
          color: '#fff',
          border: 'none',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.5,
          boxShadow: '0 4px 14px rgba(255, 108, 74, 0.45)',
          cursor: status === 'sending' ? 'not-allowed' : 'pointer',
          zIndex: 1000,
        }}
      >
        {status === 'sending' ? '…' : 'SOS'}
      </button>

      {(status === 'sent' || status === 'error') && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: 86,
            right: 16,
            left: 16,
            maxWidth: 448,
            margin: '0 auto',
            background: 'var(--surface)',
            border: '1px solid var(--coral)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            zIndex: 1000,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 4px' }}>
            {status === 'sent' ? 'SOS alert sent' : 'Could not send SOS alert'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
          <button
            className="btn-secondary"
            style={{ marginTop: 10, padding: '6px 12px', fontSize: 12 }}
            onClick={() => setStatus('idle')}
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 20,
        fontSize: 12,
        border: active ? 'none' : '1px solid var(--border)',
        background: active ? 'var(--lagoon)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Header({ island, weather }) {
  const { t } = useLanguage();
  return (
    <div style={{ background: 'var(--lagoon)', padding: '20px 16px 24px', position: 'relative', overflow: 'hidden' }}>
      {/* Line-art behind the logo, per Section 6.2 / 11 — now driven by
          weather.condition_type from GET /api/weather/:atoll instead of
          always showing the sunny state. Defaults to sunny while loading. */}
      <WeatherIcon condition={weather?.condition_type} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 500, fontSize: 16, margin: '0 0 2px' }}>Atoll Isle</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ color: 'var(--lagoon-light)', fontSize: 13, margin: 0 }}>{t('home.staying_on', { island })}</p>
            {weather && <WeatherBadge weather={weather} />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell />
          <Link to="/profile" style={{ color: '#fff', fontSize: 13, textDecoration: 'none', background: 'rgba(255,255,255,0.15)', padding: '6px 10px', borderRadius: 20 }}>
            {t('nav.profile')}
          </Link>
        </div>
      </div>
    </div>
  );
}

// The tap-to-toggle badge from the original Visualizer mockups (see
// theme.css's header comment) — shows temperature by default, taps to
// show wind speed instead.
function WeatherBadge({ weather }) {
  const [showWind, setShowWind] = useState(false);

  return (
    <button
      onClick={() => setShowWind((v) => !v)}
      style={{
        border: 'none',
        background: 'rgba(255,255,255,0.15)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
      }}
      aria-label="Toggle between temperature and wind speed"
    >
      {showWind ? `${weather.wind_speed} km/h wind` : `${weather.temperature}°C`}
    </button>
  );
}

const WEATHER_ANIMATION = {
  sunny: 'rays-rotate 40s linear infinite',
  cloudy: 'cloud-drift 6s ease-in-out infinite',
  rainy: undefined,
  windy: undefined,
  thundery: undefined,
};

// Decorative line-art matching the existing sunny icon's minimalist white-
// stroke style — one variant per weather_condition_type. Defaults to sunny
// (the original always-on state) until real weather has loaded.
function WeatherIcon({ condition }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        position: 'absolute', top: -18, left: -18, width: 100, height: 100,
        opacity: 0.4, animation: WEATHER_ANIMATION[condition] || WEATHER_ANIMATION.sunny,
        WebkitMaskImage: 'linear-gradient(115deg, black 25%, transparent 65%)',
        maskImage: 'linear-gradient(115deg, black 25%, transparent 65%)',
      }}
      aria-hidden="true"
    >
      {(condition === 'cloudy' || condition === 'rainy' || condition === 'thundery') && (
        <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <circle cx="40" cy="40" r="9" />
          <circle cx="52" cy="35" r="11" />
          <circle cx="63" cy="41" r="8" />
          <line x1="29" y1="50" x2="72" y2="50" />
        </g>
      )}

      {condition === 'rainy' && (
        <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="38" y1="58" x2="34" y2="70" style={{ animation: 'rain-fall 1.2s linear infinite' }} />
          <line x1="50" y1="58" x2="46" y2="70" style={{ animation: 'rain-fall 1.2s linear infinite 0.3s' }} />
          <line x1="62" y1="58" x2="58" y2="70" style={{ animation: 'rain-fall 1.2s linear infinite 0.6s' }} />
        </g>
      )}

      {condition === 'thundery' && (
        <polygon
          points="54,52 44,68 51,68 46,84 63,62 54,62"
          fill="#ffffff"
          stroke="none"
          style={{ animation: 'lightning-flash 2.5s ease-in-out infinite' }}
        />
      )}

      {condition === 'windy' && (
        <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M20 38 h35 a6 6 0 1 0 -6-6" style={{ animation: 'wind-flow 2.4s ease-in-out infinite' }} />
          <path d="M20 54 h48 a6 6 0 1 1 -6 6" style={{ animation: 'wind-flow 2.4s ease-in-out infinite 0.4s' }} />
          <path d="M20 70 h30" style={{ animation: 'wind-flow 2.4s ease-in-out infinite 0.8s' }} />
        </g>
      )}

      {(!condition || condition === 'sunny') && (
        <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="50" cy="50" r="14" fill="none" />
          <line x1="50" y1="24" x2="50" y2="14" />
          <line x1="24" y1="50" x2="14" y2="50" />
          <line x1="32" y1="32" x2="24" y2="24" />
          <line x1="68" y1="32" x2="76" y2="24" />
        </g>
      )}
    </svg>
  );
}

// GET /api/notifications — polled once on mount just for its unread_count,
// same call the Notifications page itself uses for the full list.
function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) return;
    getNotifications()
      .then((data) => setUnreadCount(data.unread_count || 0))
      .catch(() => {});
  }, []);

  return (
    <Link
      to="/notifications"
      aria-label="Notifications"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
        textDecoration: 'none',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            padding: '0 3px',
            borderRadius: 8,
            background: 'var(--coral)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

function ListingCard({ listing, isLocal }) {
  const { t } = useLanguage();
  const price = isLocal ? listing.local_price : listing.tourist_price;
  return (
    <Link to={`/listing/${listing.id}`} className="card" style={{ display: 'block', marginBottom: 12, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px' }}>
            {listing.title}
          </p>
          {/* Section 11's "at-a-glance trust signals" — open/closed status directly on the card. */}
          {listing.is_closed && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: 'var(--coral)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap' }}>
              {t('home.closed')}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
          {listing.business_name}
          {listing.verified_badge && <span style={{ color: 'var(--lagoon)' }}> · Verified</span>}
          {listing.review_count > 0 && (
            <span> · {Number(listing.average_rating).toFixed(1)} ★ ({listing.review_count})</span>
          )}
        </p>
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--lagoon)', margin: 0 }}>
          ${price}
          {isLocal && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}> {t('home.local_price_suffix')}</span>}
        </p>
        {Array.isArray(listing.accessibility_features) && listing.accessibility_features.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            ♿ {listing.accessibility_features.length} accessibility feature{listing.accessibility_features.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </Link>
  );
}

function EmptyState({ island }) {
  const { t } = useLanguage();
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: 14 }}>{t('home.empty_state', { island })}</p>
    </div>
  );
}