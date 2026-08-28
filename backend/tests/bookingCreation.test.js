// Batch 38 — arranged-booking commission + slot capacity
// (services/bookingCreation.js), the shared path behind b2b.js's accept
// handler and groupTransfers.js's create handler.
//
// Locks in two audit findings:
//   - Batch 37: an arranged booking a Tourist pays for gets the same
//     two-tier treatment as direct checkout — 2% only when paid online,
//     full (undiscounted) base, and business commission on the base
//     actually charged.
//   - Batch 28: assertSlotCapacity actually rejects an over-capacity
//     arranged booking (these routes used to skip the check entirely).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeArrangedBookingCharge,
  getSlotCapacity,
  assertSlotCapacity,
} from '../src/services/bookingCreation.js';

test('business payer: discounted base, 1% commission on the discounted base, no tourist fee', () => {
  const r = computeArrangedBookingCharge({
    basePrice: 100, discountPercent: 20, payer: 'business', businessPayerLabel: 'business',
  });
  assert.equal(r.payerType, 'business');
  assert.equal(r.chargedBase, 80);
  assert.equal(r.businessCommission, 0.8);
  assert.equal(r.touristCommissionApplicable, false);
  assert.equal(r.touristCommission, 0);
  assert.equal(r.priceCharged, 80);
});

test('tourist payer, pay at visit: full base, NO 2% (Section 9 — no fee on Pay at Visit)', () => {
  const r = computeArrangedBookingCharge({
    basePrice: 100, discountPercent: 20, payer: 'guest', businessPayerLabel: 'business',
    paymentMethod: 'pay_at_visit',
  });
  assert.equal(r.payerType, 'tourist');
  assert.equal(r.chargedBase, 100); // discount is NOT passed through to the tourist
  assert.equal(r.businessCommission, 1);
  assert.equal(r.touristCommissionApplicable, false);
  assert.equal(r.touristCommission, 0);
  assert.equal(r.priceCharged, 100);
});

test('tourist payer, online: full base + 2% tourist commission (Batch 37 regression)', () => {
  const r = computeArrangedBookingCharge({
    basePrice: 100, discountPercent: 20, payer: 'guest', businessPayerLabel: 'business',
    paymentMethod: 'online',
  });
  assert.equal(r.payerType, 'tourist');
  assert.equal(r.chargedBase, 100);
  assert.equal(r.businessCommission, 1);
  assert.equal(r.touristCommissionApplicable, true);
  assert.equal(r.touristCommission, 2);
  assert.equal(r.priceCharged, 102);
});

test('getSlotCapacity reads the right type_specific_fields key per business type', () => {
  assert.equal(getSlotCapacity('restaurant', { table_capacity: 6 }), 6);
  assert.equal(getSlotCapacity('excursion', { capacity_per_slot: 12 }), 12);
  assert.equal(getSlotCapacity('speedboat', { seat_capacity: 20 }), 20);
  assert.equal(getSlotCapacity('guesthouse', {}), 1); // no slot field → 1
  assert.equal(getSlotCapacity('excursion', {}), 1); // missing value → 1
  assert.equal(getSlotCapacity('excursion', { capacity_per_slot: 0 }), 1); // non-positive → 1
});

// A fake pg client: assertSlotCapacity only issues one SELECT COUNT(*).
function fakeClient(takenCount) {
  return { query: async () => ({ rows: [{ count: takenCount }] }) };
}

test('assertSlotCapacity passes when there is room for the requested seats', async () => {
  await assert.doesNotReject(
    assertSlotCapacity(fakeClient(3), {
      listingId: 'l1', slotStart: '2026-09-01T09:00:00Z',
      businessType: 'excursion', typeSpecificFields: { capacity_per_slot: 10 }, seats: 4,
    })
  );
});

test('assertSlotCapacity throws 409 when the requested seats would exceed capacity', async () => {
  await assert.rejects(
    assertSlotCapacity(fakeClient(8), {
      listingId: 'l1', slotStart: '2026-09-01T09:00:00Z',
      businessType: 'excursion', typeSpecificFields: { capacity_per_slot: 10 }, seats: 4,
    }),
    (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test('assertSlotCapacity is a no-op for zero/undefined seats', async () => {
  let queried = false;
  const spyClient = { query: async () => { queried = true; return { rows: [{ count: 0 }] }; } };
  await assertSlotCapacity(spyClient, { listingId: 'l1', slotStart: 's', businessType: 'excursion', typeSpecificFields: {}, seats: 0 });
  assert.equal(queried, false);
});
