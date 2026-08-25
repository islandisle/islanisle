// Reviews — [PHASE 2] table already existed in schema.sql (reviews) but had
// no route and no frontend. One review per completed booking/order, left by
// the tourist/local who actually completed it.

import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/reviews
 * body: { booking_id?, order_id?, rating, text? }
 * One of booking_id/order_id is required (mirrors the chk_review_target
 * constraint). The booking/order must belong to the caller and be
 * 'completed', and must not already have a review.
 */
router.post('/', authenticate, async (req, res) => {
  const { booking_id, order_id, rating, text } = req.body;

  if (!booking_id && !order_id) {
    return res.status(400).json({ error: 'booking_id or order_id is required.' });
  }
  if (booking_id && order_id) {
    return res.status(400).json({ error: 'Provide only one of booking_id or order_id.' });
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'rating must be an integer between 1 and 5.' });
  }

  let businessId;
  if (booking_id) {
    const bookingResult = await query(
      `SELECT b.id, b.user_id, b.status, l.business_id
       FROM bookings b
       JOIN listings l ON l.id = b.listing_id
       WHERE b.id = $1`,
      [booking_id]
    );
    if (!bookingResult.rows.length || bookingResult.rows[0].user_id !== req.user.id) {
      return res.status(404).json({ error: 'Booking not found for this account.' });
    }
    if (bookingResult.rows[0].status !== 'completed') {
      return res.status(400).json({ error: 'You can only review a completed booking.' });
    }
    businessId = bookingResult.rows[0].business_id;
  } else {
    const orderResult = await query(
      `SELECT id, user_id, status, business_id FROM orders WHERE id = $1`,
      [order_id]
    );
    if (!orderResult.rows.length || orderResult.rows[0].user_id !== req.user.id) {
      return res.status(404).json({ error: 'Order not found for this account.' });
    }
    if (orderResult.rows[0].status !== 'completed') {
      return res.status(400).json({ error: 'You can only review a completed order.' });
    }
    businessId = orderResult.rows[0].business_id;
  }

  const existing = await query(
    `SELECT id FROM reviews WHERE booking_id = $1 OR order_id = $2`,
    [booking_id || null, order_id || null]
  );
  if (existing.rows.length) {
    return res.status(409).json({ error: 'A review already exists for this booking/order.' });
  }

  const result = await query(
    `INSERT INTO reviews (business_id, user_id, booking_id, order_id, rating, text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, business_id, booking_id, order_id, rating, text, created_at`,
    [businessId, req.user.id, booking_id || null, order_id || null, ratingNum, text || null]
  );

  res.status(201).json({ review: result.rows[0], message: 'Thanks for your review!' });
});

/**
 * GET /api/reviews/business/:businessId
 * Public, paginated. Also returns the business's average rating and total
 * review count so the frontend doesn't need a second endpoint for that.
 */
router.get('/business/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const [reviewsResult, statsResult] = await Promise.all([
    query(
      `SELECT r.id, r.rating, r.text, r.created_at, u.name AS reviewer_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.business_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating), 0)::float AS average_rating
       FROM reviews WHERE business_id = $1`,
      [businessId]
    ),
  ]);

  res.json({
    reviews: reviewsResult.rows,
    average_rating: statsResult.rows[0].average_rating,
    total: statsResult.rows[0].total,
    page,
    limit,
  });
});

/**
 * GET /api/reviews/mine
 */
router.get('/mine', authenticate, async (req, res) => {
  const result = await query(
    `SELECT r.id, r.rating, r.text, r.created_at, r.booking_id, r.order_id, biz.name AS business_name
     FROM reviews r
     JOIN businesses biz ON biz.id = r.business_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [req.user.id]
  );
  res.json({ reviews: result.rows });
});

export default router;
