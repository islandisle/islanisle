// The Maldivian rufiyaa (MVR) isn't freely floating — the Maldives
// Monetary Authority keeps it in a managed band, currently sitting
// around 15.4–15.5 MVR per 1 USD (checked against current market data,
// not a fixed historical peg — this constant should be reviewed
// periodically, not treated as permanent). This is a display-only
// conversion: nothing charged anywhere in the app changes because of
// this number — see currency-display-brief.md's header for why. Payment
// (Stripe, Pay at Visit amounts) is untouched; a local is still charged
// the same underlying amount, only the shown currency/number differs.
export const USD_TO_MVR_RATE = 15.46;

// Tourists always see USD; locals always see MVR — never both, never a
// toggle. `amountUsd` is whatever's already stored/returned (tourist_price
// or local_price, or a charged/refund amount — all already USD-denominated
// numbers regardless of who they're charged to). Accepts a string or a
// number, since Postgres NUMERIC columns come back as strings.
export function formatPrice(amountUsd, isLocal) {
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount)) return isLocal ? 'MVR —' : '$—';

  if (!isLocal) {
    return `$${amount.toFixed(2)}`;
  }

  const mvr = amount * USD_TO_MVR_RATE;
  // Rufiyaa amounts in everyday use are typically shown as whole numbers
  // (laari, the subunit, isn't commonly used in casual pricing) — round
  // rather than showing decimals here, unlike the USD side above.
  return `MVR ${Math.round(mvr).toLocaleString()}`;
}
