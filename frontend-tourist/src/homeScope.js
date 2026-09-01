// Fix #1 — location-aware Home.
//
// On first load (no scope stored yet) we ask for GPS once. This is a
// COUNTRY-LEVEL in/out check only: there are no per-island coordinates
// anywhere in the data (schema, API, or the Ministry-of-Tourism source
// file all carry island *names* only), so we can't tell which island
// someone is standing on — only whether they're in the Maldives at all.
//   - in the Maldives  -> prompt them to pick their island
//   - abroad / denied / unavailable / timed out -> nationwide view
//
// Whatever they end up on is remembered, so later app opens go straight
// back to it (their island, or the nationwide view) until they switch
// islands or pick "I'm not in the Maldives yet" again.

const STORAGE_KEY = 'atollisle_home_scope';

// Generous bounding box around the whole archipelago (~7.1°N–0.7°S,
// ~72.6°E–73.8°E) plus margin, so a slightly-off GPS fix near the far
// north (Ihavandhippolhu) or far south (Addu) isn't misread as "abroad".
const MALDIVES_BOUNDS = { minLat: -1.5, maxLat: 7.6, minLng: 72.0, maxLng: 74.3 };

export function isInMaldives(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= MALDIVES_BOUNDS.minLat && lat <= MALDIVES_BOUNDS.maxLat &&
    lng >= MALDIVES_BOUNDS.minLng && lng <= MALDIVES_BOUNDS.maxLng
  );
}

export function getStoredHomeScope() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.mode === 'nationwide') return { mode: 'nationwide' };
    if (parsed?.mode === 'island' && parsed.island) {
      return { mode: 'island', island: parsed.island, atoll: parsed.atoll || '' };
    }
    return null;
  } catch {
    return null;
  }
}

function store(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable — the choice still applies for this session.
  }
}

export function rememberIslandScope(island, atoll) {
  store({ mode: 'island', island, atoll: atoll || '' });
}

export function rememberNationwideScope() {
  store({ mode: 'nationwide' });
}

// Runs once, only when Home has no stored scope. Resolves to 'in-country'
// or 'abroad' (the latter also covers denied / unavailable / timeout).
// Never rejects.
export function detectHomeScope() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve('abroad');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(isInMaldives(pos.coords.latitude, pos.coords.longitude) ? 'in-country' : 'abroad'),
      () => resolve('abroad'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}
