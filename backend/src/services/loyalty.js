// Referral & loyalty (Batch 19) — users.wallet_balance existed, [PHASE 2]
// and completely unread/unwritten, until now. Two things credit it:
//   1. A signup referral bonus (routes/auth.js) — both the new account and
//      whoever referred them get a flat bonus, immediately at signup.
//   2. A small loyalty credit on every completed booking/order (below),
//      called from bookings.js's /complete and orders.js's /status.
//
// Deliberately earn-only for this pass: nothing in checkout (bookings.js/
// orders.js) reads wallet_balance back to apply it as a discount yet. Doing
// that properly means deciding how a wallet credit interacts with Pay at
// Visit vs. online payment, promo codes, and refund math — real
// checkout-logic work, not a natural extension of "award some credit," so
// it's flagged here rather than bolted on riskily.

import { query } from '../config/db.js';
import { notify } from './notifications.js';

export const REFERRAL_BONUS = 5; // to each of referrer and referee, at signup
const LOYALTY_CREDIT_RATE = 0.02; // 2% of price_charged, on completion

function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function awardWalletCredit(userId, amount, { title, body }) {
  if (amount <= 0) return;
  await query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [amount, userId]);
  await notify({ recipientType: 'user', recipientId: userId, type: 'promo', title, body });
}

export async function awardLoyaltyCreditForCompletion(userId, priceCharged) {
  const credit = round2(Number(priceCharged) * LOYALTY_CREDIT_RATE);
  if (credit <= 0) return;
  await awardWalletCredit(userId, credit, {
    title: 'Loyalty credit earned',
    body: `You earned $${credit} in Atoll Isle credit for a completed booking.`,
  });
}
