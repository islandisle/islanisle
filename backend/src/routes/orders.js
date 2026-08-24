// Shop orders — script Section 4.5 / 9.
//
// Shops are stock-based (product + quantity), not slot-based (date/time) —
// bookings.js explicitly excludes them for that reason. This route mirrors
// bookings.js's dual-pricing/commission/Stripe pattern, but decrements
// stock_count instead of checking a time-slot capacity, and creates
// order_items (one row per distinct listing in the order) instead of a
// single booking row.
//
// NOT yet implemented (flagged honestly rather than faked):
//   - Cross-island speedboat delivery matching (Section 4.5's route-matching
//     logic). fulfillment_method is accepted and stored, but delivery_island,
//     matched_route_id, delivery_fee, and handover_method are all marked
//     [PHASE 2] in the schema and aren't computed here — this route only
//     supports pickup/delivery as a flat choice, not real route-matched
//     delivery scheduling.
//   - Per-item fulfillment consistency. If an order mixes listings with
//     different fulfillment_options, this only checks the requested
//     fulfillment_method against each item's own options — it doesn't
//     reconcile conflicting options across a multi-item order beyond that.

import { Router } from 'express';
import { query, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireDocumentOnFile } from '../middleware/documentGate.js';
import { stripe } from '../config/stripe.js';
import { notify } from '../services/notifications.js';

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
router.post('/', authenticate, requireDocumentOnFile, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, fulfillment_method } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array of { listing_id, quantity }.' });
    }
    if (fulfillment_method && !['pickup', 'delivery'].includes(fulfillment_method)) {
      return res.status(400).json({ error: "fulfillment_method must be 'pickup' or 'delivery'." });
    }

    const userResult = await query('SELECT type FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const payerType = userResult.rows[0].type; // 'tourist' | 'local'

    const listingIds = items.map((i) => i.listing_id);
    const listingsResult = await query(
      `SELECT l.id, l.tourist_price, l.local_price, l.approval_status, l.stock_count,
              l.fulfillment_options, b.id AS business_id, b.type AS business_type,
              b.approval_status AS business_approval_status, b.account_status
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

    const businessCommission = round2(basePrice * BUSINESS_COMMISSION_RATE);
    const touristCommissionApplicable = payerType === 'tourist';
    const touristCommission = touristCommissionApplicable ? round2(basePrice * TOURIST_COMMISSION_RATE) : 0;
    const priceCharged = round2(basePrice + touristCommission);

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

    const orderResult = await client.query(
      `INSERT INTO orders (
         business_id, user_id, base_price, payer_type, payment_method,
         business_commission, tourist_commission_applicable, tourist_commission, price_charged,
         fulfillment_method, status, escrow_status
       ) VALUES ($1,$2,$3,$4,'online',$5,$6,$7,$8,$9,'pending_payment','not_applicable')
       RETURNING id, base_price, price_charged, status, escrow_status`,
      [
        businessId, req.user.id, basePrice, payerType,
        businessCommission, touristCommissionApplicable, touristCommission, priceCharged,
        fulfillment_method || null,
      ]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, listing_id, quantity) VALUES ($1, $2, $3)`,
        [order.id, item.listing_id, Number(item.quantity)]
      );
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

    res.status(201).json({
      order: { ...order, status: 'pending_payment' },
      price_breakdown: {
        base_price: basePrice,
        tourist_service_fee: touristCommission,
        total_charged: priceCharged,
      },
      client_secret: paymentIntent.client_secret,
      message: 'Order created — confirm payment on the client to finalize it.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Could not create order.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/orders/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const ordersResult = await query(
    `SELECT o.id, o.status, o.price_charged, o.fulfillment_method, o.created_at, biz.name AS business_name
     FROM orders o
     JOIN businesses biz ON biz.id = o.business_id
     WHERE o.user_id = $1
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
    `SELECT o.id, o.status, o.escrow_status, o.price_charged, o.fulfillment_method,
            o.created_at, u.name AS customer_name
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
 * body: { status: 'confirmed' | 'ready' | 'out_for_delivery' | 'completed' }
 * Business-only, own shop's orders only. Mirrors bookings.js's /complete —
 * moving to 'completed' releases escrow so the order becomes eligible for
 * the next payout run (Section 7.2), same as payouts.js already expects.
 */
router.patch('/:id/status', authenticate, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const ALLOWED = ['confirmed', 'ready', 'out_for_delivery', 'completed'];
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ALLOWED.join(', ')}` });
  }

  const ownerCheck = await query(
    `SELECT o.id FROM orders o
     JOIN businesses biz ON biz.id = o.business_id
     WHERE o.id = $1 AND biz.owner_user_id = $2 AND o.status NOT IN ('cancelled', 'completed')`,
    [id, req.user.id]
  );
  if (!ownerCheck.rows.length) {
    return res.status(404).json({ error: 'Open order not found for a business you own.' });
  }

  const escrowClause = status === 'completed' ? `, escrow_status = 'released'` : '';
  const result = await query(
    `UPDATE orders SET status = $1${escrowClause}, updated_at = now()
     WHERE id = $2 RETURNING id, status, escrow_status`,
    [status, id]
  );

  res.json({ order: result.rows[0], message: `Order marked ${status}.` });
});

export default router;