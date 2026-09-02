// Dual, independent pricing (home-menu-pricing-viewport-brief.md item 3):
// a tourist is charged a listing's USD tourist_price, a local its
// independent MVR local_price — no conversion between them. Amounts stored
// on bookings/orders (base_price, price_charged, refund_amount, …) are
// therefore already in the payer's own currency; this just labels them for
// user-facing strings.
//
//   payerType — 'tourist' (USD) | 'local' (MVR) | 'business' (B2B, USD)
export function formatMoney(amount, payerType) {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  if (payerType === 'local') {
    // Rufiyaa in everyday pricing is shown as whole numbers.
    return `MVR ${Math.round(safe).toLocaleString('en-US')}`;
  }
  return `$${safe.toFixed(2)}`;
}
