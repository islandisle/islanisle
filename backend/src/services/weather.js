// Weather feed — script Section 6.2. weather_conditions existed in
// schema.sql with nothing reading or writing it; this is that write path.
// One row per (atoll, date) — UNIQUE(atoll, date) — refreshed at most once
// a day per atoll rather than hit on every request.
//
// Real integration: Open-Meteo (https://open-meteo.com), no API key
// required, current conditions by lat/lon. There's no real geocoding for
// arbitrary island names typed into the app (Home.jsx's island switcher is
// free text), so ISLAND_COORDINATES below only covers islands this app
// already references elsewhere (Home.jsx's default, common tourist spots);
// anything else falls back to Malé's coordinates as the closest reasonable
// approximation for a Maldives-wide app.
//
// TODO: replace the free-text island name with a real place picker backed
// by actual geocoding once one exists, instead of this fixed lookup table.

const ISLAND_COORDINATES = {
  male: { lat: 4.1755, lon: 73.5093 },
  'malé': { lat: 4.1755, lon: 73.5093 },
  maafushi: { lat: 3.9415, lon: 73.4903 },
  hulhumale: { lat: 4.2105, lon: 73.5406 },
  'hulhumalé': { lat: 4.2105, lon: 73.5406 },
  addu: { lat: -0.6300, lon: 73.1500 },
  'addu city': { lat: -0.6300, lon: 73.1500 },
  fuvahmulah: { lat: -0.2994, lon: 73.4239 },
  thulusdhoo: { lat: 4.3739, lon: 73.6459 },
};

function coordinatesFor(atoll) {
  const key = String(atoll || '').trim().toLowerCase();
  return ISLAND_COORDINATES[key] || ISLAND_COORDINATES.male;
}

// Open-Meteo's WMO weather codes collapsed down to this app's five
// line-art states (weather_condition_type).
function mapWeatherCode(code) {
  if ([95, 96, 99].includes(code)) return 'thundery';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rainy';
  if ([45, 48].includes(code)) return 'cloudy'; // fog
  if ([1, 2, 3].includes(code)) return 'cloudy';
  return 'sunny'; // 0 = clear
}

async function fetchFromOpenMeteo(atoll) {
  const { lat, lon } = coordinatesFor(atoll);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&timezone=Asia%2FColombo`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const data = await res.json();
    const current = data.current;
    if (!current) throw new Error('Open-Meteo response missing current conditions');

    const conditionType = mapWeatherCode(current.weather_code);
    return {
      condition_type: conditionType,
      temperature: current.temperature_2m,
      wind_speed: current.wind_speed_10m,
      conditions_summary: `${conditionType[0].toUpperCase()}${conditionType.slice(1)}, ${current.temperature_2m}°C, wind ${current.wind_speed_10m} km/h`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Deterministic (not random) fallback so the same atoll/day always shows
// the same stubbed weather rather than flickering between refreshes —
// used only when the real Open-Meteo call fails (offline dev, network
// egress blocked, API down).
function seededStub(atoll, dateStr) {
  const CONDITIONS = ['sunny', 'sunny', 'sunny', 'cloudy', 'rainy', 'windy', 'thundery'];
  let hash = 0;
  const seed = `${atoll}:${dateStr}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const conditionType = CONDITIONS[hash % CONDITIONS.length];
  const temperature = Math.round((27 + (hash % 5) - 2) * 10) / 10; // ~25-31°C, typical Maldives range
  const windSpeed = Math.round((8 + (hash % 20)) * 10) / 10; // ~8-28 km/h

  return {
    condition_type: conditionType,
    temperature,
    wind_speed: windSpeed,
    conditions_summary: `${conditionType[0].toUpperCase()}${conditionType.slice(1)}, ${temperature}°C, wind ${windSpeed} km/h (seeded — live weather unavailable)`,
  };
}

// Tries the real integration first; falls back to a realistic seeded stub
// on any failure (network, timeout, unexpected response shape) so the
// weather badge never just breaks.
export async function fetchWeather(atoll, dateStr) {
  try {
    return await fetchFromOpenMeteo(atoll);
  } catch (err) {
    console.error(`Weather fetch failed for ${atoll}, using seeded stub:`, err.message);
    return seededStub(atoll, dateStr);
  }
}

// Multi-day forecast — surfaced on the tourist Home screen so someone can
// see whether tomorrow's excursion or speedboat transfer is likely to run
// before they book it, not just today's snapshot. Deliberately stateless
// (no weather_conditions row, no caching table): Open-Meteo's daily
// forecast is cheap to call directly and changes model-run to model-run,
// so there's little value in a stale cached copy the way there is for
// "current conditions" (which real bookings key off of for the
// weather-cascade above).
async function fetchForecastFromOpenMeteo(atoll) {
  const { lat, lon } = coordinatesFor(atoll);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&forecast_days=5&timezone=Asia%2FColombo`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const data = await res.json();
    const daily = data.daily;
    if (!daily || !Array.isArray(daily.time)) throw new Error('Open-Meteo response missing daily forecast');

    return daily.time.map((date, i) => ({
      date,
      condition_type: mapWeatherCode(daily.weather_code[i]),
      temperature_max: daily.temperature_2m_max[i],
      temperature_min: daily.temperature_2m_min[i],
      wind_speed_max: daily.wind_speed_10m_max[i],
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// Same deterministic-seed approach as seededStub above, extended across 5
// days so the fallback forecast is internally consistent (today's stub
// day here also matches what seededStub would return for the same date).
function seededForecast(atoll) {
  const days = [];
  const base = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const stub = seededStub(atoll, dateStr);
    days.push({
      date: dateStr,
      condition_type: stub.condition_type,
      temperature_max: stub.temperature + 2,
      temperature_min: stub.temperature - 3,
      wind_speed_max: stub.wind_speed,
    });
  }
  return days;
}

export async function fetchForecast(atoll) {
  try {
    return await fetchForecastFromOpenMeteo(atoll);
  } catch (err) {
    console.error(`Forecast fetch failed for ${atoll}, using seeded stub:`, err.message);
    return seededForecast(atoll);
  }
}
