// Dual, independent pricing (home-menu-pricing-viewport-brief.md item 3):
// a listing carries a real USD price (tourist_price) charged to tourist
// accounts and a real MVR price (local_price) charged to local accounts.
// They are NOT converted from each other — a business sets each directly,
// with no fixed ratio. This replaces the earlier "currency-display-brief"
// approach, which stored one number and multiplied it by ~15.46 MVR/USD
// for local display only.
//
// So `amount` is already in the currency for `isLocal`: local_price (or a
// charge/refund derived from it) for a local, tourist_price (or a charge
// derived from it) for a tourist. Just format it — no arithmetic.
// Accepts a string or a number (Postgres NUMERIC columns come back as
// strings).
export function formatPrice(amount, isLocal) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return isLocal ? 'MVR —' : '$—';

  if (isLocal) {
    // Rufiyaa in everyday pricing is shown as whole numbers (laari, the
    // subunit, isn't used casually).
    return `MVR ${Math.round(n).toLocaleString()}`;
  }
  return `$${n.toFixed(2)}`;
}
