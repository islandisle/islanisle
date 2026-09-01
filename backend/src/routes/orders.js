// Shop orders — script Section 4.5 / 9.
//
// Shops are stock-based (product + quantity), not slot-based (date/time) —
// bookings.js explicitly excludes them for that reason. This route mirrors
// bookings.js's dual-pricing/commission/Stripe pattern, but decrements
// stock_count instead of checking a time-slot capacity, and creates
// order_items (one row per distinct listing in the order) instead of a
// single booking row. Same platform-wide 'online' payment disable as
// bookings.js — see config/payments.js's ONLINE_PAYMENTS_ENABLED.
//
// Cross-island speedboat delivery matching (Section 4.5, [PHASE 2]): when
// delivery_island differs from the shop's own location_island, the
// fastest matching approved speedboat listing (real Phase 1 schedule data
// — see services/deliveryMatch.js) is looked up and, if found, recorded
// on the order plus a package_deliveries row. handover_method chooses
// between the buyer picking up at the boat, or — using the check-in data
// already on the buyer's account (users.current_stay_business_id /
// current_stay_room_number) — a guesthouse handover, which notifies that
// guesthouse of an arriving package tied to the guest's room.
//
// NOT yet implemented (flagged honestly rather than faked):
//   - Per-item fulfillment consistency. If an order mixes listings with
//     different fulfillment_options, this only checks the requested
//     fulfillment_method against each item's own options — it doesn't
//     reconcile conflicting options across a multi-item order beyond that.
//
// Batch 22: delivery_fee used to be hardcoded 0 regardless of
// free_delivery — the flag was stored and shown on the listing form but
// never read back. No delivery-fee amount was ever specified anywhere in
// the spec, so CROSS_ISLAND_DELIVERY_FEE below is an assumed flat rate,
// not a documented one — flagging it as a judgment call. free_delivery is
// per-listing (Section 4.5: "per product or store-wide"); for a
// multi-item order this waives the fee only if EVERY item in the order
// has it set, since one paid-shipping item in the cart means the order
// as a whole isn't free to ship.
const CROSS_ISLAND_DELIVERY_FEE = 5;

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireDocumentOnFile } from '../middleware/documentGate.js';
import { requireFlightTicketForCrossIsland } from '../middleware/flightTicketGate.js';
import { stripe } from '../config/stripe.js';
import { ONLINE_PAYMENTS_ENABLED, ONLINE_PAYMENTS_DISABLED_MESSAGE } from '../config/payments.js';
import { notify } from '../services/notifications.js';
import { applyPromoCode } from '../services/promoCodes.js';
import { accruePayAtVisitCommission, isPayAtVisitEligible } from '../services/payAtVisit.js';
import { findFastestDelivery } from '../services/deliveryMatch.js';
import { awardLoyaltyCreditForCompletion } from '../services/loyalty.js';
import { reportUnpaidPayAtVisit } from '../services/payAtVisitIncidents.js';

const router = Router();

const BUSINESS_COMMISSION_RATE = 0.01; // 1%, always applies (Section 9)
const TOURIST_COMMISSION_RATE = 0.02;  // 2%, only when payer is Tourist paying online

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * POST /api/orders
 * body: { items: [{ listing_id, quantity }], fulfillment_method: 'pickup' | 'delivery' }
 *
 * All items must belong to the same shop business. Stock is decremented
 * atomically inside the transaction with a WHERE stock_count >= quantity
 * guard, so two concurrent orders can't both succeed against the last unit.
 * A listing with stock_count = NULL is treated as not stock-tracked
 * (unlimited) — the shop signup/listing form doesn't require a count.
 */
router.post('/', authenticate, requireDocumentOnFile, requireFlightTicketForCrossIsland, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, fulfillment_method, payment_method, promo_code, delivery_island, handover_method, member_ids } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array of { listing_id, quantity }.' });
    }
    if (fulfillment_method && !['pickup', 'delivery'].includes(fulfillment_method)) {
      return res.status(400).json({ error: "fulfillment_method must be 'pickup' or 'delivery'." });
    }
    if (handover_method && !['buyer_pickup_at_boat', 'guesthouse_handover'].includes(handover_method)) {
      return res.status(400).json({ error: "handover_method must be 'buyer_pickup_at_boat' or 'guesthouse_handover'." });
    }

    // Group bookings (Section 2.2) — see bookings.js's identical block for
    // the full rationale; order_members is this table's equivalent of
    // booking_members.
    let coveredMemberIds = [];
    if (Array.isArray(member_ids) && member_ids.length > 0) {
      const rosterResult = await query(
        `SELECT DISTINCT tgm2.user_id
         FROM travel_group_members tgm
         JOIN travel_group_members tgm2 ON tgm2.travel_group_id = tgm.travel_group_id
         WHERE tgm.user_id = $1 AND tgm2.user_id = ANY($2::uuid[]) AND tgm2.user_id != $1`,
        [req.user.id, member_ids]
      );
      const validIds = new Set(rosterResult.rows.map((r) => r.user_id));
      const invalid = member_ids.filter((id) => !validIds.has(id));
      if (invalid.length) {
        return res.status(400).json({ error: 'One or more selected members are not in your travel group.' });
      }
      coveredMemberIds = [...validIds];
    }

    // Same 'online' vs 'pay_at_visit' split as bookings.js — see that
    // file's top comment for the full rationale.
    const isPayAtVisit = payment_method === 'pay_at_visit';

    const userResult = await query('SELECT type, pay_at_visit_eligible FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const payerType = userResult.rows[0].type; // 'tourist' | 'local'

    const listingIds = items.map((i) => i.listing_id);
    const listingsResult = await query(
      `SELECT l.id, l.title, l.tourist_price, l.local_price, l.approval_status, l.stock_count,
              l.fulfillment_options, l.pay_at_visit_enabled, l.free_delivery, b.id AS business_id, b.type AS business_type,
              b.approval_status AS business_approval_status, b.account_status, b.trust_tier, b.location_island
       FROM listings l
       JOIN businesses b ON b.id = l.business_id
       WHERE l.id = ANY($1::uuid[])`,
      [listingIds]
    );

    if (listingsResult.rows.length !== listingIds.length) {
      return res.status(404).json({ error: 'One or more items were not found.' });
    }

    const listingsById = Object.fromEntries(listingsResult.rows.map((l) => [l.id, l]));
    const businessIds = new Set(listingsResult.rows.map((l) => l.business_id));
    if (businessIds.size > 1) {
      return res.status(400).json({ error: 'All items in one order must be from the same shop.' });
    }
    const businessId = [...businessIds][0];
    const business = listingsResult.rows[0];

    if (business.business_type !== 'shop') {
      return res.status(400).json({ error: 'These listings are not from a shop — use /api/bookings instead.' });
    }
    if (business.business_approval_status !== 'approved' || business.account_status !== 'active') {
      return res.status(400).json({ error: 'This shop is not currently available.' });
    }

    // Pay at Visit enforcement (Section 9 / [PHASE 2]): a 'new', unverified
    // business can ONLY take Pay at Visit — its listings have
    // pay_at_visit_enabled forced true (see business.js's listing-creation
    // route) — and can't use 'online' until it graduates. A graduated
    // business can use either, but pay_at_visit still requires each
    // listing to have opted in.
    const isNewBusiness = business.trust_tier === 'new';
    if (!isPayAtVisit) {
      // Online payment is off platform-wide right now (Stripe isn't
      // available as a merchant option in the Maldives yet) — reject this
      // before the trust-tier check even runs, so it can't be bypassed by
      // pointing at a graduated business. See config/payments.js.
      if (!ONLINE_PAYMENTS_ENABLED) {
        return res.status(400).json({ error: ONLINE_PAYMENTS_DISABLED_MESSAGE });
      }
      if (isNewBusiness) {
        return res.status(400).json({
          error: 'This business is still building trust — only Pay at Visit is available until it graduates.',
        });
      }
    }

    // Pay at Visit eligibility (Section 9 / [PHASE 2]) — see
    // services/payAtVisit.js's isPayAtVisitEligible for the full rationale,
    // including why a user's very first-ever booking/order is exempted.
    if (isPayAtVisit && !(await isPayAtVisitEligible(req.user.id, userResult.rows[0].pay_at_visit_eligible))) {
      return res.status(403).json({
        error: payerType === 'tourist'
          ? "Pay at Visit isn't available on this account yet — it unlocks after your first guesthouse or hotel check-in."
          : "Pay at Visit isn't available on this account yet — it unlocks once your Local ID verification is approved.",
      });
    }

    // Cross-island delivery matching — see this file's top comment.
    let deliveryMatch = null;
    let currentStay = null;
    if (fulfillment_method === 'delivery' && delivery_island && business.location_island) {
      deliveryMatch = await findFastestDelivery(business.location_island, delivery_island);
      if (!deliveryMatch) {
        return res.status(400).json({
          error: `No speedboat delivery is currently listed from ${business.location_island} to ${delivery_island}.`,
        });
      }
      if (handover_method === 'guesthouse_handover') {
        const stayResult = await query(
          'SELECT current_stay_business_id, current_stay_room_number FROM users WHERE id = $1',
          [req.user.id]
        );
        currentStay = stayResult.rows[0];
        if (!currentStay?.current_stay_business_id || !currentStay?.current_stay_room_number) {
          return res.status(400).json({
            error: 'Guesthouse handover requires an active check-in — check in at your guesthouse first, or choose boat pickup instead.',
          });
        }
      }
    }

    let basePrice = 0;
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: `Invalid quantity for listing ${item.listing_id}.` });
      }
      const listing = listingsById[item.listing_id];
      if (listing.approval_status !== 'approved') {
        return res.status(400).json({ error: `Item ${item.listing_id} is not currently available.` });
      }
      // Only enforced while online payment is actually available — with it
      // globally disabled, Pay at Visit must never be blocked for anyone,
      // regardless of trust tier or whether the listing itself opted in.
      if (isPayAtVisit && ONLINE_PAYMENTS_ENABLED && !(listing.pay_at_visit_enabled === true || isNewBusiness)) {
        return res.status(400).json({ error: `Pay at Visit is not available for one of the items in your order.` });
      }
      if (listing.stock_count != null && listing.stock_count < quantity) {
        return res.status(409).json({ error: `Only ${listing.stock_count} left of an item in your order.` });
      }
      if (
        fulfillment_method &&
        Array.isArray(listing.fulfillment_options) &&
        listing.fulfillment_options.length > 0 &&
        !listing.fulfillment_options.includes(fulfillment_method)
      ) {
        return res.status(400).json({ error: `${fulfillment_method} isn't offered for one of the items in your order.` });
      }
      const unitPrice = payerType === 'tourist' ? listing.tourist_price : listing.local_price;
      basePrice = round2(basePrice + unitPrice * quantity);
    }

    // free_delivery only waives the fee if every item in the order has it
    // set — see this file's top comment.
    const deliveryFee = deliveryMatch && !items.every((item) => listingsById[item.listing_id].free_delivery)
      ? CROSS_ISLAND_DELIVERY_FEE
      : 0;

    const businessCommission = round2(basePrice * BUSINESS_COMMISSION_RATE);
    const touristCommissionApplicable = !isPayAtVisit && payerType === 'tourist';
    const touristCommission = touristCommissionApplicable ? round2(basePrice * TOURIST_COMMISSION_RATE) : 0;

    await client.query('BEGIN');

    // Decrement stock first, inside the transaction, so a failed decrement
    // (someone else bought the last unit a moment ago) rolls back cleanly
    // before any order/order_items rows or Stripe charge are created.
    for (const item of items) {
      const listing = listingsById[item.listing_id];
      if (listing.stock_count != null) {
        const decrement = await client.query(
          `UPDATE listings SET stock_count = stock_count - $1
           WHERE id = $2 AND stock_count >= $1
           RETURNING stock_count`,
          [Number(item.quantity), item.listing_id]
        );
        if (!decrement.rows.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'An item in your order just sold out. Please review your order.' });
        }
      }
    }

    // Promo codes (Phase 2): same atomic validate-and-claim as bookings.js
    // — see services/promoCodes.js. Commissions above stay computed on the
    // pre-discount basePrice; only price_charged reflects the discount.
    let promoCodeId = null;
    let promoDiscountAmount = 0;
    if (promo_code) {
      ({ promoCodeId, discountAmount: promoDiscountAmount } = await applyPromoCode(client, {
        businessId,
        code: promo_code,
        basePrice,
      }));
    }
    const priceCharged = round2(basePrice + touristCommission + deliveryFee - promoDiscountAmount);

    const orderResult = await client.query(
      `INSERT INTO orders (
         business_id, user_id, base_price, payer_type, payment_method,
         business_commission, tourist_commission_applicable, tourist_commission, price_charged,
         promo_code_id, promo_discount_amount, fulfillment_method,
         delivery_island, matched_route_id, delivery_fee, handover_method,
         status, escrow_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id, base_price, price_charged, status, escrow_status`,
      [
        businessId, req.user.id, basePrice, payerType,
        isPayAtVisit ? 'pay_at_visit' : 'online',
        businessCommission, touristCommissionApplicable, touristCommission, priceCharged,
        promoCodeId, promoDiscountAmount,
        fulfillment_method || null,
        deliveryMatch ? delivery_island : null,
        deliveryMatch ? deliveryMatch.listing_id : null,
        deliveryFee,
        deliveryMatch ? (handover_method || 'buyer_pickup_at_boat') : null,
        isPayAtVisit ? 'confirmed' : 'pending_payment',
        'not_applicable',
      ]
    );
    const order = orderResult.rows[0];

    for (const memberId of coveredMemberIds) {
      await client.query(
        `INSERT INTO order_members (order_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [order.id, memberId]
      );
    }

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, listing_id, quantity) VALUES ($1, $2, $3)`,
        [order.id, item.listing_id, Number(item.quantity)]
      );
    }

    let packageDelivery = null;
    if (deliveryMatch) {
      const resolvedHandover = handover_method || 'buyer_pickup_at_boat';
      const packageDeliveryResult = await client.query(
        `INSERT INTO package_deliveries (
           order_id, route_id, departure_datetime, boat_business_id,
           handover_method, guesthouse_business_id, room_number, notified_status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
         RETURNING id, departure_datetime`,
        [
          order.id, deliveryMatch.listing_id, deliveryMatch.departure, deliveryMatch.business_id,
          resolvedHandover,
          resolvedHandover === 'guesthouse_handover' ? currentStay.current_stay_business_id : null,
          resolvedHandover === 'guesthouse_handover' ? currentStay.current_stay_room_number : null,
        ]
      );
      packageDelivery = packageDeliveryResult.rows[0];
    }

    // Guesthouse handover: notify the guesthouse of an arriving package
    // tied to the guest's room — sent once, after commit, from whichever
    // branch below actually finalizes the order.
    async function notifyGuesthouseIfNeeded() {
      if (!packageDelivery || handover_method !== 'guesthouse_handover') return;
      await notify({
        recipientType: 'business',
        recipientId: currentStay.current_stay_business_id,
        type: 'package_delivery',
        title: 'Package arriving for a guest',
        body: `A shop order for Room ${currentStay.current_stay_room_number} is arriving by speedboat (${deliveryMatch.boat_name}) on ${new Date(deliveryMatch.departure).toLocaleString()}.`,
      });
    }

    const deliveryInfo = packageDelivery
      ? {
          delivery_island,
          departure: packageDelivery.departure_datetime,
          boat_name: deliveryMatch.boat_name,
          handover_method: handover_method || 'buyer_pickup_at_boat',
        }
      : null;

    if (isPayAtVisit) {
      // Digital receipt (Section 6.3) — same rationale as bookings.js's
      // pay_at_visit branch: the Stripe webhook (payments.js) is the only
      // other place an invoice row is ever created, and it never fires for
      // this path. service_description lists every item, the same way the
      // webhook's own order-invoice branch does. payment_date stays NULL —
      // payment happens later, in person, when the shop marks this fulfilled.
      const itemsDescription = items
        .map((item) => `${item.quantity}x ${listingsById[item.listing_id].title}`)
        .join(', ');
      await client.query(
        `INSERT INTO invoices (
           order_id, business_id, buyer_user_id, service_description, base_price,
           tourist_commission_line, total_charged, payment_method, booking_date, payment_date, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), NULL, 'confirmed')`,
        [
          order.id, businessId, req.user.id, itemsDescription || 'Shop order',
          basePrice, touristCommission, priceCharged, 'pay_at_visit',
        ]
      );

      await client.query('COMMIT');
      await notify({
        recipientType: 'user',
        recipientId: req.user.id,
        type: 'booking_confirmation',
        title: 'Order confirmed',
        body: `Your order is confirmed — pay $${priceCharged} in person.`,
      });
      await notifyGuesthouseIfNeeded();
      return res.status(201).json({
        order,
        price_breakdown: { base_price: basePrice, tourist_service_fee: 0, promo_discount: promoDiscountAmount, total_charged: priceCharged },
        delivery: deliveryInfo,
        message: `Order confirmed. Pay $${priceCharged} in person.`,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(priceCharged * 100),
      currency: 'usd',
      metadata: { order_id: order.id, user_id: req.user.id, business_id: businessId },
      automatic_payment_methods: { enabled: true },
    });

    await client.query(
      'UPDATE orders SET stripe_payment_intent_id = $1 WHERE id = $2',
      [paymentIntent.id, order.id]
    );

    await client.query('COMMIT');
    // Guesthouse handover notification is deliberately not sent here — this
    // order isn't confirmed until payments.js's webhook fires, and
    // frontend-tourist doesn't exercise this 'online' path today anyway
    // (checkout always sends pay_at_visit; see ListingDetail.jsx).

    res.status(201).json({
      order: { ...order, status: 'pending_payment' },
      price_breakdown: {
        base_price: basePrice,
        tourist_service_fee: touristCommission,
        promo_discount: promoDiscountAmount,
        total_charged: priceCharged,
      },
      delivery: deliveryInfo,
      client_secret: paymentIntent.client_secret,
      message: 'Order created — confirm payment on the client to finalize it.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Order creation error:', err);
    // See bookings.js's identical catch block for why this is NODE_ENV-gated.
    res.status(500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Could not create order.'
        : `Could not create order: ${err.message}`,
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/orders/delivery-check?listing_id=&delivery_island=
 * Public — the product/purchase screen calls this before checkout to show
 * whether cross-island delivery is possible, and if so when the matching
 * speedboat departs and its name. No auth required, same "browse as guest"
 * posture as listings.js.
 */
router.get('/delivery-check', async (req, res) => {
  const { listing_id, delivery_island } = req.query;
  if (!listing_id || !delivery_island) {
    return res.status(400).json({ error: 'listing_id and delivery_island are required.' });
  }

  const listingResult = await query(
    `SELECT b.location_island AS shop_island, l.free_delivery
     FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.id = $1`,
    [listing_id]
  );
  if (!listingResult.rows.length) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  const { shop_island: shopIsland, free_delivery: freeDelivery } = listingResult.rows[0];

  if (!shopIsland || shopIsland.trim().toLowerCase() === delivery_island.trim().toLowerCase()) {
    return res.json({ available: true, cross_island: false, shop_island: shopIsland, delivery_island });
  }

  const match = await findFastestDelivery(shopIsland, delivery_island);
  if (!match) {
    return res.json({ available: false, cross_island: true, shop_island: shopIsland, delivery_island });
  }
  res.json({
    available: true,
    cross_island: true,
    shop_island: shopIsland,
    delivery_island,
    departure: match.departure,
    boat_name: match.boat_name,
    // Batch 22 — free_delivery now actually affects what's charged
    // (see this file's top comment); surfaced here so the tourist sees
    // the fee before checkout, not just at the final total.
    delivery_fee: freeDelivery ? 0 : CROSS_ISLAND_DELIVERY_FEE,
  });
});

/**
 * GET /api/orders/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const ordersResult = await query(
    `SELECT o.id, o.status, o.price_charged, o.fulfillment_method, o.created_at, biz.name AS business_name,
            (o.user_id != $1) AS booked_by_someone_else,
            booker.name AS booked_by_name
     FROM orders o
     JOIN businesses biz ON biz.id = o.business_id
     JOIN users booker ON booker.id = o.user_id
     WHERE o.user_id = $1
        OR o.id IN (SELECT order_id FROM order_members WHERE user_id = $1)
     ORDER BY o.created_at DESC`,
    [req.user.id]
  );

  const orders = ordersResult.rows;
  if (orders.length) {
    const itemsResult = await query(
      `SELECT oi.order_id, oi.quantity, l.title
       FROM order_items oi
       JOIN listings l ON l.id = oi.listing_id
       WHERE oi.order_id = ANY($1::uuid[])`,
      [orders.map((o) => o.id)]
    );
    const itemsByOrder = {};
    for (const row of itemsResult.rows) {
      (itemsByOrder[row.order_id] ??= []).push({ title: row.title, quantity: row.quantity });
    }
    for (const order of orders) {
      order.items = itemsByOrder[order.id] || [];
    }
  }

  res.json({ orders });
});

/**
 * GET /api/orders/business/:businessId
 * Owner-only view of everything ordered from a shop — same gap as bookings:
 * previously no list existed on the business frontend at all.
 */
router.get('/business/:businessId', authenticate, async (req, res) => {
  const ownerCheck = await query(
    'SELECT id FROM businesses WHERE id = $1 AND owner_user_id = $2',
    [req.params.businessId, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Business not found for this account.' });
  }

  const ordersResult = await query(
    `SELECT o.id, o.status, o.escrow_status, o.price_charged, o.fulfillment_method, o.payment_method,
            o.created_at, u.name AS customer_name,
            1 + (SELECT COUNT(*)::int FROM order_members om WHERE om.order_id = o.id) AS party_size
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.business_id = $1
     ORDER BY o.created_at DESC`,
    [req.params.businessId]
  );

  const orders = ordersResult.rows;
  if (orders.length) {
    const itemsResult = await query(
      `SELECT oi.order_id, oi.quantity, l.title
       FROM order_items oi
       JOIN listings l ON l.id = oi.listing_id
       WHERE oi.order_id = ANY($1::uuid[])`,
      [orders.map((o) => o.id)]
    );
    const itemsByOrder = {};
    for (const row of itemsResult.rows) {
      (itemsByOrder[row.order_id] ??= []).push({ title: row.title, quantity: row.quantity });
    }
    for (const order of orders) {
      order.items = itemsByOrder[order.id] || [];
    }
  }

  res.json({ orders });
});

/**
 * PATCH /api/orders/:id/status
 * body: { status: 'confirmed' | 'ready' | 'out_for_delivery' | 'completed', payment_collected? }
 * Business-only, own shop's orders only. Mirrors bookings.js's /complete —
 * moving to 'completed' releases escrow so the order becomes eligible for
 * the next payout run (Section 7.2), same as payouts.js already expects.
 * payment_collected (Batch 23) only matters alongside status: 'completed'
 * on a pay_at_visit order; defaults true.
 */
router.patch('/:id/status', authenticate, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const paymentCollected = req.body?.payment_collected !== false;
  const ALLOWED = ['confirmed', 'ready', 'out_for_delivery', 'completed'];
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ALLOWED.join(', ')}` });
  }

  const ownerCheck = await query(
    `SELECT o.id, o.payment_method, o.business_commission, o.business_id, o.user_id, o.price_charged
     FROM orders o
     JOIN businesses biz ON biz.id = o.business_id
     WHERE o.id = $1 AND biz.owner_user_id = $2 AND o.status NOT IN ('cancelled', 'completed')`,
    [id, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Open order not found for a business you own.' });
  }
  const order = ownerCheck.rows[0];
  const isPayAtVisit = order.payment_method === 'pay_at_visit';

  // pay_at_visit never had funds held in escrow (see bookings.js's
  // /complete for the same reasoning) — stays 'not_applicable'; its
  // commission is accrued below instead.
  const result = status === 'completed'
    ? await query(
        `UPDATE orders SET status = $1, escrow_status = $2, updated_at = now()
         WHERE id = $3 RETURNING id, status, escrow_status`,
        [status, isPayAtVisit ? 'not_applicable' : 'released', id]
      )
    : await query(
        `UPDATE orders SET status = $1, updated_at = now()
         WHERE id = $2 RETURNING id, status, escrow_status`,
        [status, id]
      );

  if (status === 'completed' && isPayAtVisit && !paymentCollected) {
    await reportUnpaidPayAtVisit({
      businessId: order.business_id, userId: order.user_id, orderId: id, amount: order.price_charged,
    });
  } else if (status === 'completed' && isPayAtVisit) {
    await accruePayAtVisitCommission(order.business_id, order.business_commission, { orderId: id });
  }

  if (status === 'completed' && paymentCollected) {
    await awardLoyaltyCreditForCompletion(order.user_id, order.price_charged);
  }

  res.json({ order: result.rows[0], message: `Order marked ${status}.` });
});

export default router;