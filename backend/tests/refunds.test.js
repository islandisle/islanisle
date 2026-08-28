// Batch 38 — refund fee math (services/refunds.js). Locks in Section 7.1's
// rule and the specific things the audits leaned on: a Pay at Visit
// booking or an operator-fault cancellation never loses a cent to fees,
// and an online cancellation loses exactly platform 5% + the business's
// own configurable share.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round2, computeRefund } from '../src/services/refunds.js';

test('round2 rounds to two decimals', () => {
  assert.equal(round2(2.344), 2.34);
  assert.equal(round2(2.346), 2.35);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(100), 100);
});

test('Pay at Visit cancellation refunds the full amount, no fee', () => {
  const r = computeRefund({ priceCharged: 120, paymentMethod: 'pay_at_visit', refundFeeBusinessPercent: 5, isOperatorFault: false });
  assert.equal(r.grossRefundAmount, 120);
  assert.equal(r.refundAppFee, 0);
  assert.equal(r.refundBusinessCredit, 0);
  assert.equal(r.refundAmount, 120);
});

test('operator-fault cancellation refunds the full amount even when paid online', () => {
  const r = computeRefund({ priceCharged: 200, paymentMethod: 'online', refundFeeBusinessPercent: 8, isOperatorFault: true });
  assert.equal(r.refundAppFee, 0);
  assert.equal(r.refundBusinessCredit, 0);
  assert.equal(r.refundAmount, 200);
});

test('online tourist-fault cancellation withholds platform 5% + business share', () => {
  const r = computeRefund({ priceCharged: 100, paymentMethod: 'online', refundFeeBusinessPercent: 5, isOperatorFault: false });
  assert.equal(r.refundAppFee, 5); // fixed platform 5%
  assert.equal(r.refundBusinessCredit, 5); // business's own 5%
  assert.equal(r.refundAmount, 90);
});

test('business refund-fee share is configurable and compounds with the platform fee', () => {
  const r = computeRefund({ priceCharged: 250, paymentMethod: 'online', refundFeeBusinessPercent: 10, isOperatorFault: false });
  assert.equal(r.refundAppFee, 12.5);
  assert.equal(r.refundBusinessCredit, 25);
  assert.equal(r.refundAmount, 212.5);
});
