import { isNetworkError } from './offlineQueue';

// Batch 35 — turn a raw API error into a sentence a tourist can act on.
// It never invents a recovery path that doesn't exist: when there's no
// clearer thing to say, it falls back to the server's own message. Pass a
// `t` from useLanguage() so the message follows the selected language;
// without one it returns English.
export function friendlyError(err, { t } = {}) {
  const tr = typeof t === 'function' ? t : defaultString;
  if (isNetworkError(err)) return tr('error.offline');

  const status = err && err.status;
  const serverMsg = err && err.message && !/^Request failed/.test(err.message) ? err.message : '';

  if (status === 401) return tr('error.session_expired');
  if (status === 403) return serverMsg || tr('error.forbidden');
  if (status === 404) return serverMsg || tr('error.not_found');
  if (status === 409) return serverMsg || tr('error.slot_taken');
  if (status === 400 || status === 422) return serverMsg || tr('error.form');
  if (status >= 500) return tr('error.server');
  return serverMsg || tr('error.generic');
}

// Used only when no t() is supplied (tests, isolated renders).
function defaultString(key) {
  switch (key) {
    case 'error.offline': return "You appear to be offline. Check your connection — your booking or order will send automatically once you're back online.";
    case 'error.session_expired': return 'Your session has expired. Please log in again, then try once more.';
    case 'error.forbidden': return "Your account can't complete this action.";
    case 'error.not_found': return 'That listing is no longer available — it may have been removed or closed by the business.';
    case 'error.slot_taken': return 'That time was just taken. Pick another slot, or join the waitlist below.';
    case 'error.form': return 'Please check the details above and try again.';
    case 'error.server': return 'Something went wrong on our side. Wait a moment and try again — nothing was charged.';
    default: return "We couldn't complete that. Please try again.";
  }
}
