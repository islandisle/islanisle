import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getIslandListings, getNotifications, getWeather, getWeatherForecast, getMyFavoriteIds, addFavorite, removeFavorite, getTripContext, getLocalEvents, getExternalPlaces } from '../api/client';
import IslandPicker from '../components/IslandPicker';
import FirstRunTour from '../components/FirstRunTour';
import HeaderSearch from '../components/HeaderSearch';
import AnchoredPopover from '../components/AnchoredPopover';
import NavMenu from '../components/NavMenu';
import { buildNavMenuItems } from '../navConfig';
import { runSOS, reportSOSToast } from '../sos';
import { isMaldivesNight } from '../maldivesTime';
import { getStoredHomeScope, rememberIslandScope, rememberNationwideScope, detectHomeScope } from '../homeScope';
import { SectionArt } from '../components/SectionArt';
import { AmbientBackground } from '../components/AmbientBackground';
import { LeafBackdrop } from '../components/LeafBackdrop';
import EmptyState from '../components/EmptyState';
import { SkeletonList } from '../components/Skeleton';
import { useLanguage } from '../i18n';
import { useToast } from '../components/Toast';
import { formatPrice } from '../utils/currency';

// Batch 31 — a few well-populated islands to suggest when the selected one
// has nothing yet (the app rolls out island by island).
const SUGGESTED_ISLANDS = ['Maafushi', 'Malé', 'Hulhumalé', 'Thulusdhoo', 'Dhigurah'];

const DEFAULT_ISLAND = 'Maafushi';
const DEFAULT_ATOLL = 'Kaafu'; // Maafushi's real atoll — paired with DEFAULT_ISLAND so
                               // downstream lookups can disambiguate same-named islands

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

// Fix #1 — the Home "scope": one island, or the nationwide all-islands
// feed. Seeded from what the visitor last landed on (localStorage), so a
// returning user goes straight back there; a first-time visitor with no
// stored scope gets a one-off GPS check in the mount effect below.
//
// Read fresh on every mount (not once at module load) — the island
// switcher now lives on the My Trips screen (home-menu-pricing brief
// item 1), which writes the new scope to localStorage and navigates back
// here; Home is remounted by that navigation and must pick it up.

export default function Home() {
  const [island, setIsland] = useState(() => {
    const s = getStoredHomeScope();
    return s?.mode === 'nationwide' ? 'all' : (s?.island || DEFAULT_ISLAND);
  });
  const [atoll, setAtoll] = useState(() => {
    const s = getStoredHomeScope();
    return s?.mode === 'nationwide' ? '' : (s?.atoll ?? DEFAULT_ATOLL);
  });
  const [scope, setScope] = useState(() => (getStoredHomeScope()?.mode === 'nationwide' ? 'nationwide' : 'island'));
  const [pickerAutoOpen, setPickerAutoOpen] = useState(false);
  const nationwide = scope === 'nationwide';
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
  const { showToast } = useToast();

  // Fix #1 — pick a single island (remembered for next time) or switch to
  // the nationwide feed. Every place that changes the island funnels
  // through these so the choice always persists.
  function selectIsland(isl, atl) {
    setIsland(isl);
    setAtoll(atl || '');
    setScope('island');
    rememberIslandScope(isl, atl || '');
  }
  function selectNationwide() {
    setIsland('all');
    setAtoll('');
    setScope('nationwide');
    rememberNationwideScope();
  }

  // First visit only (no scope stored yet): one GPS check. In the Maldives
  // -> open the picker so they choose their island (there are no per-island
  // coordinates to auto-match against). Abroad / denied / unavailable ->
  // the nationwide view. See homeScope.js.
  useEffect(() => {
    if (getStoredHomeScope()) return;
    let cancelled = false;
    detectHomeScope().then((result) => {
      if (cancelled) return;
      if (result === 'abroad') selectNationwide();
      else setPickerAutoOpen(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Batch 30 — the page background (styles/theme.css's --page-bg, with a
  // crossfade on `body`) is tinted per selected category. Kept synced here;
  // reset only when leaving Home so other pages start from the default.
  useEffect(() => {
    document.body.dataset.category = typeFilter || 'all';
  }, [typeFilter]);
  useEffect(() => () => { delete document.body.dataset.category; }, []);

  // Accessibility features only mean anything for a place to stay
  // (step-free access, wheelchair-accessible room, etc.) and dietary tags
  // only mean anything for a place to eat. Each panel appears only under
  // its own category tab — not under "All" and not under any other
  // category (home-menu-pricing brief item 4). Switching away from that
  // category also clears the filter's selections and collapses its panel,
  // so a hidden filter can never keep silently narrowing results the
  // tourist can't see or reach anymore.
  const showsAccessibilityFilter = typeFilter === 'guesthouse';
  const showsDietaryFilter = typeFilter === 'restaurant';

  useEffect(() => {
    if (!showsAccessibilityFilter) {
      setAccessibilityFilter([]);
      setShowAccessibilityFilters(false);
    }
  }, [showsAccessibilityFilter]);

  useEffect(() => {
    if (!showsDietaryFilter) {
      setDietaryFilter([]);
      setShowDietaryFilters(false);
    }
  }, [showsDietaryFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getIslandListings(island, typeFilter || undefined, accessibilityFilter, dietaryFilter, atoll || undefined)
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
  }, [island, atoll, typeFilter, accessibilityFilter, dietaryFilter]);

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
    if (isFavorited) {
      showToast({
        message: 'Removed from favorites.',
        actionLabel: 'Undo',
        onAction: () => {
          setFavoriteIds((prev) => new Set(prev).add(listingId));
          addFavorite(listingId).catch(() => {
            setFavoriteIds((prev) => {
              const next = new Set(prev);
              next.delete(listingId);
              return next;
            });
          });
        },
      });
    }
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
    // Nationwide view has no single island to show conditions for.
    if (nationwide) return undefined;

    function refresh() {
      getWeather(island)
        .then((data) => { if (!cancelled) setWeather(data.weather); })
        .catch(() => {}); // decorative — a failed fetch just means no badge/live icon, not an error banner
    }

    refresh();
    const intervalId = setInterval(refresh, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [island, nationwide]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <AmbientBackground type={typeFilter || 'all'} />
      <LeafBackdrop />
      <Header island={island} weather={weather} nationwide={nationwide} />

      {/* First-run only (no stored scope, GPS says in-country): a one-off
          "pick your island" prompt. The island switcher itself now lives on
          the My Trips screen — this is just the onboarding moment. */}
      {pickerAutoOpen && (
        <IslandPicker
          hideTrigger
          autoOpen
          value={nationwide ? '' : island}
          onChange={(isl, atl) => { selectIsland(isl, atl); setPickerAutoOpen(false); }}
          onNotInMaldives={() => { selectNationwide(); setPickerAutoOpen(false); }}
          onClose={() => setPickerAutoOpen(false)}
        />
      )}

      <div style={{ padding: 16 }}>
        <WelcomeBack context={tripContext} />
        <TripStagePriority context={tripContext} isLocal={isLocal} />

        {/* Section 3.2/11 "Choosing a Stay Island" — the picker now lives in
            the header (tap the island name); cross-island listing search is
            the header search icon. Both were dedicated body sections before. */}
        {!nationwide && (
          <Link
            to={`/transfers?from=${encodeURIComponent(island)}`}
            className="card"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', marginBottom: 14, textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--navy)' }}>🏝️ Heading to another island?</span>
            <span style={{ fontSize: 12, color: 'var(--lagoon)', fontWeight: 600 }}>Find a transfer →</span>
          </Link>
        )}

        {/* Category chips scroll horizontally on one line, no scrollbar
            chrome (home-menu-pricing brief item 2). overflow-x is scoped to
            this row so the page itself doesn't scroll sideways. */}
        <div
          className="no-scrollbar"
          style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 10 }}
        >
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

        {showsAccessibilityFilter && (
          <>
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
          </>
        )}

        {showsDietaryFilter && (
          <>
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
          </>
        )}

        {/* "Local guide: events, visa & customs" was a duplicate of the
            hamburger-menu entry (home-menu-pricing brief item 5) — removed
            from Home; the menu version stays. */}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', margin: 0 }}>
            {nationwide ? "What's on across the Maldives" : t('home.whats_on', { island })}
          </p>
          {/* "Nearby now" scoped to "open now" on the current island — see
              schema.sql's comment on the favorites table for why: no lat/lng
              exists anywhere in this schema to do real geolocation with. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={openNowOnly} onChange={(e) => setOpenNowOnly(e.target.checked)} />
            Open now
          </label>
        </div>

        {typeFilter && (
          <SectionArt
            type={typeFilter}
            subtitle={nationwide ? "Across the Maldives" : t('home.staying_on', { island })}
          />
        )}

        {loading && <SkeletonList count={5} />}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          nationwide ? (
            <EmptyState message="Nothing is listed anywhere yet — the app is rolling out island by island." />
          ) : (
            <IslandEmptyState
              island={island}
              onPickIsland={(isl) => selectIsland(isl, '')}
            />
          )
        )}

        {listings.filter((l) => !openNowOnly || !l.is_closed).map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            isLocal={isLocal}
            showIsland={nationwide}
            isFavorited={favoriteIds.has(listing.id)}
            onToggleFavorite={localStorage.getItem('atollisle_token') ? toggleFavorite : undefined}
          />
        ))}

        {!nationwide && <ExternalPlacesSection island={island} atoll={atoll} typeFilter={typeFilter} />}
      </div>

      <MessagesButton />
      <FirstRunTour />
    </div>
  );
}

// 5-day outlook icon set — GET /api/weather/:atoll/forecast (stateless
// proxy onto Open-Meteo's daily forecast; see backend/src/services/
// weather.js). Small emoji set (not the big decorative WeatherIcon) since
// these render tiny, side by side, inside the header weather popover
// (WeatherPopover, opened from the temperature badge).
const FORECAST_ICON = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  windy: '💨',
  thundery: '⛈️',
};

// "More on this island" — real Ministry-of-Tourism registered places
// (backend/data/maldives_accommodations_master.json, see externalPlaces.js)
// that aren't bookable here, shown so a tourist sees the island's real
// options even when few (or no) businesses have signed up yet. This data
// only covers lodging (Guest House / Home Stay / Hotel) — there's no
// equivalent import for restaurants, excursions, transfers, or shops.
//
// Only fetch it when the selected category is one it could actually
// answer (All, or Guesthouse specifically) — asking the backend for
// guesthouse data while the tourist has "Excursions" selected would just
// come back irrelevant. For every other category, skip the network call
// entirely and say plainly that no public listing source exists yet,
// rather than silently showing nothing (which read as broken) or showing
// guesthouses under an "Excursions" filter (which read as wrong).
function ExternalPlacesSection({ island, atoll, typeFilter }) {
  const [data, setData] = useState(null);
  const coversThisFilter = typeFilter === '' || typeFilter === 'guesthouse';

  useEffect(() => {
    if (!coversThisFilter) {
      setData(null);
      return;
    }
    let cancelled = false;
    getExternalPlaces(island, atoll || undefined).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [island, atoll, coversThisFilter]);

  if (!coversThisFilter) {
    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 16 }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', margin: '0 0 4px' }}>
          More on {island}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          No public listings available at the moment.
        </p>
      </div>
    );
  }

  if (!data) return null;
  const groups = [
    { label: 'Guest houses', places: data.guesthouses },
    { label: 'Home stays', places: data.home_stays },
    { label: 'Hotels', places: data.hotels },
  ].filter((g) => g.places && g.places.length > 0);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 16 }} />
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--navy)', margin: '0 0 4px' }}>
        More on {island}
      </p>
      {groups.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          No public listings available at the moment.
        </p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

// Home's fixed corner button. This used to be the SOS/panic button (+ an
// "Emergency contacts" pill); SOS now lives only in the hamburger menu
// (on every screen), so this corner slot is a quick jump into the
// two-tab message bar instead — it opens on the Business & trips tab by
// default (no ?tab=), and the user can switch to Friends from there.
function MessagesButton() {
  return (
    <Link
      to="/messages"
      aria-label="Messages"
      className="glass-nav"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 16,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'var(--lagoon)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(14, 124, 102, 0.4)',
        zIndex: 1000,
        textDecoration: 'none',
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H9l-4 3.5V16H4z" />
      </svg>
    </Link>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        whiteSpace: 'nowrap',
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

function Header({ island, weather, nationwide }) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isNight = isMaldivesNight();
  const menuItems = buildNavMenuItems({
    onSOS: () => runSOS({ island: nationwide ? null : island, report: reportSOSToast(showToast) }),
  });
  // Home is always the Atoll Isle context; picking "Socisle" jumps to the
  // Go Social feed (home-menu-pricing brief item 6).
  const contextModes = {
    current: 'atoll',
    onSelect: (mode) => navigate(mode === 'social' ? '/social' : '/'),
  };
  return (
    <div className="glass-nav" style={{ background: isNight ? 'var(--night-sky)' : 'var(--lagoon)', padding: '20px 16px 24px', position: 'relative', overflow: 'hidden' }}>
      {/* Line-art behind the logo, per Section 6.2 / 11 — driven by
          weather.condition_type from GET /api/weather/:atoll, and now also
          by actual Maldives local time so a clear sky shows the moon
          rather than the sun after dark. Defaults to sunny while loading. */}
      <WeatherIcon condition={weather?.condition_type} isNight={isNight} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 500, fontSize: 16, margin: '0 0 2px' }}>Atoll Isle</p>
          {/* The island switcher moved to My Trips (home-menu-pricing brief
              item 1); the header just shows current conditions now. */}
          {!nationwide && weather && <WeatherBadge weather={weather} island={island} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
          <HeaderSearch />
          <NotificationBell />
          <NavMenu items={menuItems} label={t('nav.menu')} contextModes={contextModes} />
        </div>
      </div>
    </div>
  );
}

// The temperature badge from the original Visualizer mockups (see
// theme.css's header comment). Background stays transparent-white; tapping
// it now opens a small weather popover anchored below it (5-day outlook +
// current conditions) — this replaced the dedicated forecast card that
// used to sit in the page body.
function WeatherBadge({ weather, island }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
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
        aria-label={`Weather on ${island} — ${weather.temperature}°C`}
      >
        {`${weather.temperature}°C`}
      </button>
      {open && (
        <WeatherPopover
          anchorRef={btnRef}
          island={island}
          weather={weather}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// The 5-day forecast that used to live in a body card, now anchored under
// the temperature badge. GET /api/weather/:atoll/forecast, fetched fresh
// each time the popover opens (cheap stateless proxy).
function WeatherPopover({ anchorRef, island, weather, onClose }) {
  const [forecast, setForecast] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getWeatherForecast(island)
      .then((d) => { if (!cancelled) setForecast(d.forecast || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [island]);

  return (
    <AnchoredPopover anchorRef={anchorRef} onClose={onClose} ariaLabel={`Weather on ${island}`} width={300} translucent>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', margin: '0 0 2px' }}>
        {island}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        {weather.temperature}°C · {weather.wind_speed} km/h wind
      </p>
      {forecast.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Forecast unavailable right now.</p>
      ) : (
        // All 5 days visible at once — no inner scroll (brief item 7).
        <div style={{ display: 'flex', gap: 3 }}>
          {forecast.slice(0, 5).map((day, i) => (
            <div
              key={day.date}
              style={{
                flex: '1 1 0', minWidth: 0, textAlign: 'center', padding: '6px 2px',
                borderRadius: 'var(--radius-sm)', background: i === 0 ? 'var(--lagoon-tint)' : 'transparent',
              }}
            >
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '0 0 3px' }}>
                {i === 0 ? 'Today' : new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <p style={{ fontSize: 17, margin: '0 0 3px' }} aria-hidden="true">
                {FORECAST_ICON[day.condition_type] || FORECAST_ICON.sunny}
              </p>
              <p style={{ fontSize: 10, color: 'var(--navy)', margin: 0, whiteSpace: 'nowrap' }}>
                {Math.round(day.temperature_max)}°/{Math.round(day.temperature_min)}°
              </p>
            </div>
          ))}
        </div>
      )}
    </AnchoredPopover>
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
// stroke style — one variant per weather_condition_type, plus a day/night
// swap on the clear-sky glyph (sun by day, crescent moon by night — see
// isMaldivesNight above). Defaults to sunny (the original always-on state)
// until real weather has loaded.
function WeatherIcon({ condition, isNight }) {
  const isClear = !condition || condition === 'sunny';
  const animation = isClear && isNight ? undefined : (WEATHER_ANIMATION[condition] || WEATHER_ANIMATION.sunny);
  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        position: 'absolute', top: -18, left: -18, width: 100, height: 100,
        opacity: 0.4, animation,
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
        isNight ? (
          <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M58 24 a20 20 0 1 0 18 28 a15 15 0 0 1 -18 -28 z" />
            <circle cx="70" cy="30" r="1.5" fill="#ffffff" stroke="none" />
            <circle cx="76" cy="40" r="1" fill="#ffffff" stroke="none" />
          </g>
        ) : (
          <g stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="50" cy="50" r="14" fill="none" />
            <line x1="50" y1="24" x2="50" y2="14" />
            <line x1="24" y1="50" x2="14" y2="50" />
            <line x1="32" y1="32" x2="24" y2="24" />
            <line x1="68" y1="32" x2="76" y2="24" />
          </g>
        )
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

// Batch 31 — a light "welcome back" touch for a returning tourist who has
// something in progress: their current stay if checked in, otherwise their
// next upcoming booking. Silent for a first-time visitor or a logged-in
// user with nothing booked.
function WelcomeBack({ context }) {
  const user = getCurrentUser();
  if (!user) return null;
  const currentStay = context.current_stay;
  const nextBooking = context.next_booking;
  if (!currentStay && !nextBooking) return null;

  const firstName = (user.name || '').trim().split(' ')[0] || 'traveller';
  return (
    <Link
      to={currentStay ? '/trips' : `/bookings#booking-${nextBooking.id}`}
      className="card"
      style={{ display: 'block', padding: 14, marginBottom: 14, textDecoration: 'none', background: 'var(--lagoon-tint)', border: 'none' }}
    >
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 3px' }}>
        Welcome back, {firstName}
      </p>
      {currentStay ? (
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
          You're checked in at {currentStay.business_name}
          {currentStay.room_number ? ` · Room ${currentStay.room_number}` : ''}
        </p>
      ) : (
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', margin: 0 }}>
          Next up: {nextBooking.title} · {new Date(nextBooking.slot_start).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
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

export function ListingCard({ listing, isLocal, isFavorited, onToggleFavorite, showIsland }) {
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
          {showIsland && listing.location_island && (
            <span> · 📍 {listing.location_island}</span>
          )}
          {listing.verified_badge && <span style={{ color: 'var(--lagoon)' }}> · Verified</span>}
          {listing.review_count > 0 && (
            <span> · {Number(listing.average_rating).toFixed(1)} ★ ({listing.review_count})</span>
          )}
        </p>
        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--lagoon)', margin: 0 }}>
          {formatPrice(price, isLocal)}
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

function IslandEmptyState({ island, onPickIsland }) {
  const { t } = useLanguage();
  const others = SUGGESTED_ISLANDS.filter((i) => i.toLowerCase() !== (island || '').toLowerCase()).slice(0, 4);
  return (
    <EmptyState message={t('home.empty_state', { island })}>
      {others.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>Try an island that's up and running:</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {others.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickIsland(i)}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 13,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--lagoon)', cursor: 'pointer',
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}
    </EmptyState>
  );
}