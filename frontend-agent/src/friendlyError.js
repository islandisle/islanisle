// Batch 35 — turn a raw API error into a sentence an agent can act on,
// without inventing a recovery path that doesn't exist. When there's no
// clearer thing to say it falls back to the server's own message.
export function friendlyError(err) {
  if (err instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  const status = err && err.status;
  const serverMsg = err && err.message && !/^Request failed/.test(err.message) ? err.message : '';

  if (status === 401) return 'Your session has expired. Please log in again, then retry.';
  if (status === 403) return serverMsg || "This business hasn't accepted your connection, so you can't book for it yet.";
  if (status === 404) return serverMsg || 'That listing is no longer available — refresh and pick another.';
  if (status === 409) return serverMsg || 'That slot is full. Check availability again and pick another time.';
  if (status === 400 || status === 422) return serverMsg || 'Please check the booking details above and try again.';
  if (status >= 500) return 'Something went wrong on our side. Wait a moment and try again.';
  return serverMsg || "Couldn't complete the booking. Please try again.";
}
