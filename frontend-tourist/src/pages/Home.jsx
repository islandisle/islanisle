import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getIslandListings, sendSOS, getNotifications, getWeather, getMyFavoriteIds, addFavorite, removeFavorite, getTripContext, getLocalEvents, getExternalPlaces } from '../api/client';
import IslandPicker from '../components/IslandPicker';
import FirstRunTour from '../components/FirstRunTour';
import GlobalSearch from '../components/GlobalSearch';
import Hint from '../components/Hint';
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

// Batch 19 — kept in sync manually with database/schema.sql's comment above
// listings.dietary_tags / frontend-business's Dashboard.jsx DIETARY_TAGS.
const DIETARY_TAGS = [
  { key: 'vegetarian', label: 'Vegetarian options' },
  { key: 'vegan', label: 'Vegan options' },
  { key: 'halal', label: 'Halal' },
  { key: 'gluten_free', label: 'Gluten-free options' },
  { key: 'dairy_free', label: 'Dairy-free options' },
  { key: 'nut_free', label: 'Nut-free options' },
  { key: 'pescatarian', label: 'Pescatarian options' },
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
  const [dietaryFilter, setDietaryFilter] = useState([]);
  const [showDietaryFilters, setShowDietaryFilters] = useState(false);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weather, setWeather] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [openNowOnly, setOpenNowOnly] = useState(false);
  // Batch 24 — trip-stage-aware prioritization. { stage: 'none' } until
  // fetched (or for a guest with no token, which never fetches at all —
  // browse-as-guest has no trip to be staged against).
  const [tripContext, setTripContext] = useState({ stage: 'none' });

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
    getIslandListings(island, typeFilter || undefined, accessibilityFilter, dietaryFilter)
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
  }, [island, typeFilter, accessibilityFilter, dietaryFilter]);

  function toggleAccessibilityFeature(key, checked) {
    setAccessibilityFilter((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
  }

  // Favorites (Batch 19) — fetched once as just the id set, cheap enough to
  // hold for the whole session and used to light up each ListingCard's
  // star without a per-card round trip.
  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) return;
    getMyFavoriteIds()
      .then((data) => setFavoriteIds(new Set(data.listing_ids)))
      .catch(() => {});
  }, []);

  // Batch 24 — trip-stage-aware prioritization: fetched once on mount (the
  // underlying signal — current_stay_business_id, upcoming bookings — only
  // changes via a check-in or a new booking, neither of which happens
  // without leaving this page, so a one-time fetch is enough).
  useEffect(() => {
    if (!localStorage.getItem('atollisle_token')) return;
    getTripContext()
      .then(setTripContext)
      .catch(() => {}); // decorative prioritization — a failed fetch just means the default browse order, not an error banner
  }, []);

  function toggleFavorite(listingId, isFavorited) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFavorited) next.delete(listingId); else next.add(listingId);
      return next;
    });
    (isFavorited ? removeFavorite(listingId) : addFavorite(listingId)).catch(() => {
      // revert optimistic update on failure
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorited) next.add(listingId); else next.delete(listingId);
        return next;
      });
    });
  }

  function toggleDietaryTag(key, checked) {
    setDietaryFilter((prev) =>
      checked ? [...prev, key] : prev.filter((k) => k !== key)
    );
  }

  // Section 6.2: the header's line-art and tappable badge are meant to
  // reflect real conditions for the island currently selected, not be
  // purely decorative. Batch 22: this used to fetch once per island
  // change and then sit static — the backend's own cache was once-per-day
  // regardless, so a page left open all day never saw a condition change.
  // Polls every 15 minutes (matching backend/src/routes/weather.js's own
  // staleness window) as long as this page is open; only resets to null
  // (the loading state) on an actual island change, not on a refresh
  // tick, so the badge doesn't flicker every 15 minutes.
  useEffect(() => {
    let cancelled = false;
    setWeather(null);

    function refresh() {
      getWeather(island)
        .then((data) => { if (!cancelled) setWeather(data.weather); })
        .catch(() => {}); // decorative — a failed fetch just means no badge/live icon, not an error banner
    }

    refresh();
    const intervalId = setInterval(refresh, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [island]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <Header island={island} weather={weather} />

      <div style={{ padding: 16 }}>
        <TripStagePriority context={tripContext} isLocal={isLocal} />

        {/* Section 3.2/11 "Choosing a Stay Island": searchable, grouped by
            atoll — not a curated island directory with photos/descriptions
            (that's a larger, separate piece), but a real picker rather than
            a plain text field. Reuses the same getIslandListings(island,
            type) call the backend already supports. */}
        <Hint id="home-search" text={t('hint.search')} />
        <GlobalSearch />

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

        <button
          type="button"
          onClick={() => setShowDietaryFilters((v) => !v)}
          aria-expanded={showDietaryFilters}
          aria-controls="dietary-filter-panel"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: showDietaryFilters ? 8 : 14,
            fontSize: 13,
            color: 'var(--lagoon)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {t('home.dietary_filters')}{dietaryFilter.length > 0 ? ` (${dietaryFilter.length})` : ''}
          <span aria-hidden="true">{showDietaryFilters ? '▲' : '▼'}</span>
        </button>

        {showDietaryFilters && (
          <div
            id="dietary-filter-panel"
            role="group"
            aria-label="Filter listings by dietary option"
            className="card"
            style={{ padding: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {DIETARY_TAGS.map((tag) => (
              <label key={tag.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={dietaryFilter.includes(tag.key)}
                  onChange={(e) => toggleDietaryTag(tag.key, e.target.checked)}
                />
                {tag.label}
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
            marginBottom: 6,
          }}
        >
          {t('home.arriving_by_air')}
        </Link>

        <Link
          to={`/local-guide?island=${encodeURIComponent(island)}`}
          style={{
            display: 'block',
            fontSize: 13,
            color: 'var(--lagoon)',
            textDecoration: 'none',
            marginBottom: 14,
          }}
        >
          {t('home.local_guide_link')}
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>
            {t('home.whats_on', { island })}
          </p>
          {/* "Nearby now" scoped to "open now" on the current island — see
              schema.sql's comment on the favorites table for why: no lat/lng
              exists anywhere in this schema to do real geolocation with. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={openNowOnly} onChange={(e) => setOpenNowOnly(e.target.checked)} />
            Open now
          </label>
        </div>

        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t('common.loading')}</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && listings.length === 0 && <EmptyState island={island} />}

        {listings.filter((l) => !openNowOnly || !l.is_closed).map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            isLocal={isLocal}
            isFavorited={favoriteIds.has(listing.id)}
            onToggleFavorite={localStorage.getItem('atollisle_token') ? toggleFavorite : undefined}
          />
        ))}

        <ExternalPlacesSection island={island} />
      </div>

      <SOSButton island={island} />
      <FirstRunTour />
    </div>
  );
}

// Batch 25 (not in the original spec) — "More on this island": real
// Ministry of Tourism registered places that aren't on the platform yet,
// split into the source data's own three categories (Guest House / Home
// Stay / Hotel — kept distinct, never merged into one "accommodation"
// bucket). Deliberately separated from the real, bookable listings above
// (own heading, no ListingCard, no booking action) so it's never mistaken
// for something bookable through Atoll Isle.
function ExternalPlacesSection({ island }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getExternalPlaces(island).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [island]);

  if (!data) return null;
  const groups = [
    { label: 'Guest houses', places: data.guesthouses },
    { label: 'Home stays', places: data.home_stays },
    { label: 'Hotels', places: data.hotels },
  ].filter((g) => g.places && g.places.length > 0);
  if (groups.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 16 }} />
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', margin: '0 0 4px' }}>
        More on {island}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        Ministry of Tourism registered places — not bookable here.
      </p>
      {groups.map((group) => (
        <div key={group.label} style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {group.label}
          </p>
          {group.places.map((place) => (
            <div key={place.id} className="card" style={{ padding: '12px 14px', marginBottom: 8, opacity: 0.9 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 4px' }}>{place.name}</p>
              {data.contact_locked ? (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, filter: 'blur(3px)', userSelect: 'none' }}>
                  071 234 5678 · contact@example.com
                </p>
              ) : (
                (place.phone || place.email) && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                    {[place.phone, place.email].filter(Boolean).join(' · ')}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      ))}
      {/* No real Pro purchase flow exists yet (see config/proTier.js) — this
          is just the locked-state prompt the spec asks for, ready for a
          real upgrade action once one exists. */}
      {data.contact_locked && (
        <p style={{ fontSize: 12, color: 'var(--lagoon)', fontWeight: 500, margin: 0 }}>
          Upgrade to Pro to see contact info
        </p>
      )}
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
      <Link
        to="/emergency-contacts"
        style={{
          position: 'fixed',
          bottom: 82,
          right: 16,
          fontSize: 11,
          color: 'var(--text-secondary)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          padding: '4px 10px',
          textDecoration: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
        }}
      >
        Emergency contacts
      </Link>

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

// Batch 24 — trip-stage-aware Home prioritization. Renders one of three
// things above the normal island-browse UI, based on GET /api/trips/context:
//   'pre_arrival' — a prompt toward Arrival Transfers, since a tourist
//     with a booking starting soon and no check-in yet hasn't landed.
//   'on_island'   — that island's excursions + local events, since arrival
//     transfer is no longer relevant once actually checked in somewhere.
//   'none'        — nothing; falls through to today's default browse.
function TripStagePriority({ context, isLocal }) {
  const [excursions, setExcursions] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (context.stage !== 'on_island' || !context.island) return;
    getIslandListings(context.island, 'excursion').then((d) => setExcursions(d.listings || [])).catch(() => {});
    getLocalEvents(context.island).then((d) => setEvents(d.events || [])).catch(() => {});
  }, [context.stage, context.island]);

  if (context.stage === 'pre_arrival') {
    return (
      <Link
        to="/transfers"
        className="card"
        style={{
          display: 'block', padding: 16, marginBottom: 16, textDecoration: 'none',
          background: 'var(--lagoon)', color: '#fff', border: 'none',
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>
          Arriving soon?
        </p>
        <p style={{ fontSize: 13, margin: 0, opacity: 0.9 }}>
          Your trip is coming up — book your airport transfer now so it's ready when you land →
        </p>
      </Link>
    );
  }

  if (context.stage === 'on_island') {
    if (excursions.length === 0 && events.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', marginBottom: 10 }}>
          On {context.island} now
        </p>
        {excursions.slice(0, 3).map((listing) => (
          <ListingCard key={listing.id} listing={listing} isLocal={isLocal} />
        ))}
        {events.slice(0, 3).map((e) => (
          <div key={e.id} className="card" style={{ padding: 12, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 2px' }}>{e.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              {new Date(e.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 16px' }} />
      </div>
    );
  }

  return null;
}

export function ListingCard({ listing, isLocal, isFavorited, onToggleFavorite }) {
  const { t } = useLanguage();
  const price = isLocal ? listing.local_price : listing.tourist_price;
  return (
    <Link to={`/listing/${listing.id}`} className="card" style={{ display: 'block', marginBottom: 12, textDecoration: 'none', color: 'inherit', position: 'relative' }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--navy)', margin: '0 0 2px', paddingRight: onToggleFavorite ? 24 : 0 }}>
            {listing.title}
          </p>
          {/* Section 11's "at-a-glance trust signals" — open/closed status directly on the card. */}
          {listing.is_closed && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: 'var(--coral)', padding: '2px 7px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap' }}>
              {t('home.closed')}
            </span>
          )}
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            aria-label={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
            aria-pressed={isFavorited}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(listing.id, isFavorited);
            }}
            style={{
              position: 'absolute', top: 10, right: 10, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 18, color: isFavorited ? 'var(--coral)' : 'var(--text-muted)',
              lineHeight: 1, padding: 4,
            }}
          >
            {isFavorited ? '★' : '☆'}
          </button>
        )}
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
        {Array.isArray(listing.dietary_tags) && listing.dietary_tags.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            🍽 {listing.dietary_tags.map((tag) => tag.replace(/_/g, ' ')).join(', ')}
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