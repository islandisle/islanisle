// Promo code application — shared by bookings.js and orders.js at
// checkout, since both need the exact same atomic "is this code valid and
// under its usage limit, and if so claim one use" logic. The claim is a
// single conditional UPDATE (same pattern orders.js already uses for
// stock_count) so it's race-safe without a separate row lock, and it runs
// inside the caller's own transaction so a later failure (capacity
// conflict, Stripe error) rolls the claimed use back too.

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Throws a { statusCode, message } error the route's catch block can
// surface directly, rather than falling through to a generic 500.
export async function applyPromoCode(client, { businessId, code, basePrice }) {
  if (!code) {
    return { promoCodeId: null, discountAmount: 0 };
  }

  const normalizedCode = code.trim().toUpperCase();
  const result = await client.query(
    `UPDATE promo_codes
     SET times_used = times_used + 1
     WHERE business_id = $1 AND code = $2
       AND valid_from <= now() AND valid_to >= now()
       AND (usage_limit IS NULL OR times_used < usage_limit)
     RETURNING id, discount_type, discount`,
    [businessId, normalizedCode]
  );

  if (!result.rows.length) {
    const err = new Error('That promo code is invalid, expired, or fully redeemed.');
    err.statusCode = 400;
    throw err;
  }

  const promo = result.rows[0];
  const rawDiscount = promo.discount_type === 'percentage'
    ? basePrice * (Number(promo.discount) / 100)
    : Number(promo.discount);
  const discountAmount = Math.min(round2(rawDiscount), basePrice);

  return { promoCodeId: promo.id, discountAmount };
}
