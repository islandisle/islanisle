// Stripe isn't available as a merchant option in the Maldives yet, so the
// 'online' payment_method is disabled platform-wide until a processor that
// does support the Maldives is integrated — every booking/order must go
// through 'pay_at_visit' instead, regardless of business trust tier.
//
// This does NOT remove any Stripe integration (config/stripe.js, the
// PaymentIntent creation in bookings.js/orders.js, the webhook in
// payments.js, or refund issuance in bookings.js/orders.js/returns.js) —
// all of it stays wired up and ready. Flipping this back to true is meant
// to be the only change needed to re-enable the 'online' path once a real
// processor is in place.
export const ONLINE_PAYMENTS_ENABLED = false;

export const ONLINE_PAYMENTS_DISABLED_MESSAGE =
  'Online payment is temporarily unavailable platform-wide (Stripe isn\'t available as a merchant option in the Maldives yet) — please use Pay at Visit.';
