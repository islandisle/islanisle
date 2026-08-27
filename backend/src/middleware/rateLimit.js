// Rate limiting — Batch 29. The auth and SOS endpoints had no throttling at
// all: POST /api/auth/login accepted unlimited password guesses against a
// known email, and POST /api/sos would insert a row and fan out an admin
// notification on every call with no cooldown.
//
// In-memory store (the library default) — fine for a single backend
// instance, which is what this deploys as (see jobs/scheduler.js's own
// note about multi-instance). A multi-instance deploy would want a shared
// store (Redis) so the limit is enforced across instances.

import rateLimit from 'express-rate-limit';

// Login: only FAILED attempts count (skipSuccessfulRequests), so a busy
// front desk logging in and out normally is never affected — but a burst
// of wrong passwords from one IP is stopped. Keyed by IP.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Please wait a few minutes and try again.' },
});

// Signup: whole requests count. One IP creating accounts in a loop is the
// thing being stopped; a real person signing up once is far under this.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this network. Please try again later.' },
});

// SOS: a genuine emergency needs to get through, so this is deliberately
// loose — it only stops a stuck client (or an abusive one) from hammering
// the endpoint. Keyed by the authenticated user, since the route runs
// after authenticate().
export const sosLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Your SOS alert has already been sent. Help is being notified — please stay put if it is safe to do so.' },
});
