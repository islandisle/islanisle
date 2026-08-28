// Batch 35 — turn a raw API error into a sentence a business can act on,
// without inventing a recovery path that doesn't exist. Falls back to the
// server's own message whenever it's more specific than a generic status.
export function friendlyError(err) {
  if (err instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  const status = err && err.status;
  const serverMsg = err && err.message && !/^Request failed/.test(err.message) ? err.message : '';

  if (status === 401) return 'Your session has expired. Please log in again, then retry.';
  if (status === 403) return serverMsg || "Your account can't do that.";
  if (status === 404) return serverMsg || 'That request is no longer available — refresh the list.';
  if (status === 409) return serverMsg || "That slot is already full, so this booking can't be confirmed. Free up capacity or decline the request.";
  if (status === 400 || status === 422) return serverMsg || 'Please check the details and try again.';
  if (status >= 500) return 'Something went wrong on our side. Wait a moment and try again.';
  return serverMsg || "That didn't go through. Please try again.";
}
