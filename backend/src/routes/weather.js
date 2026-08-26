// Weather feed — script Section 6.2's decorative header line-art (sunny/
// cloudy/rainy/windy/thundery) and the tappable temp/wind badge are meant
// to reflect real conditions, not be purely decorative. Public, no auth —
// same "browse as guest" posture as listings.js.

import { Router } from 'express';
import { query } from '../config/db.js';
import { fetchWeather } from '../services/weather.js';
import { triggerWeatherCascade } from '../services/weatherCascade.js';

const router = Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

const STALE_AFTER_MINUTES = 15; // matches Home.jsx's own polling interval

/**
 * GET /api/weather/:atoll
 * Returns today's cached row if one exists and is still fresh (within
 * STALE_AFTER_MINUTES); otherwise fetches, stores, and returns a fresh
 * one. Batch 22: previously cached for the whole day regardless of age —
 * fine when nothing ever polled this more than once, but Home.jsx now
 * polls periodically to stay live, and a once-a-day cache would have made
 * that polling pointless (same row all day, every day).
 */
router.get('/:atoll', async (req, res) => {
  const { atoll } = req.params;
  const date = todayStr();

  const existing = await query(
    `SELECT atoll, date, condition_type, temperature, wind_speed, conditions_summary
     FROM weather_conditions
     WHERE atoll = $1 AND date = $2 AND fetched_at > now() - make_interval(mins => $3)`,
    [atoll, date, STALE_AFTER_MINUTES]
  );
  if (existing.rows.length) {
    return res.json({ weather: existing.rows[0] });
  }

  const fetched = await fetchWeather(atoll, date);

  const result = await query(
    `INSERT INTO weather_conditions (atoll, date, condition_type, temperature, wind_speed, conditions_summary, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (atoll, date) DO UPDATE SET
       condition_type = EXCLUDED.condition_type, temperature = EXCLUDED.temperature,
       wind_speed = EXCLUDED.wind_speed, conditions_summary = EXCLUDED.conditions_summary,
       fetched_at = now()
     RETURNING atoll, date, condition_type, temperature, wind_speed, conditions_summary`,
    [atoll, date, fetched.condition_type, fetched.temperature, fetched.wind_speed, fetched.conditions_summary]
  );

  // Weather-cancellation cascade (Batch 19) — reachable on every fresh
  // fetch now (not just the day's first one, since caching is staleness-
  // based rather than once-per-day). Naturally idempotent either way:
  // triggerWeatherCascade only ever touches 'confirmed' bookings, so a
  // repeat call the same day just no-ops against anything it already
  // cancelled, and correctly still catches a booking made *after* an
  // earlier cascade already ran.
  if (fetched.condition_type === 'thundery') {
    triggerWeatherCascade(atoll, date).catch((err) => {
      console.error(`Weather cascade failed for ${atoll} on ${date}:`, err);
    });
  }

  res.json({ weather: result.rows[0] });
});

export default router;
