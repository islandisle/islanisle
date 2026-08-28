// Batch 38 — payout run (services/payoutRun.js). Locks in the Batch 28
// fixes the audits flagged:
//   - refund-fee credits are paid to a business exactly once (each credited
//     row is stamped with the payout that settled it and filtered out of
//     later runs) — previously every run re-summed every historical credit.
//   - cancelled shop orders and processed returns are included in the
//     credit total, not just cancelled bookings.
//
// A stateful fake stands in for the pg pool (via node:test module mocking),
// honouring the `... IS NULL` / `NOT IN (payout_line_items ...)` filters the
// real SQL uses, so a second run sees the same rows the real DB would.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const dbUrl = new URL('../src/config/db.js', import.meta.url).href;
const notifyUrl = new URL('../src/services/notifications.js', import.meta.url).href;

// One business, one released online booking, plus one cancelled booking,
// one cancelled order and one completed return each carrying a business
// refund-fee credit.
function makeFakeDb() {
  const state = {
    bookingPaidOut: false,
    creditsStamped: false,
    payoutInserts: [],
    stampCalls: [],
  };

  async function query(text, params) {
    const t = text.replace(/\s+/g, ' ').trim();

    if (t.startsWith('SELECT DISTINCT l.business_id AS id FROM bookings')) {
      // eligible businesses: only while there's an un-paid booking OR dues
      return { rows: state.bookingPaidOut ? [] : [{ id: 'biz-1' }] };
    }
    if (t.includes("FROM bookings b JOIN listings l ON l.id = b.listing_id") && t.includes("escrow_status = 'released'")) {
      return { rows: state.bookingPaidOut ? [] : [{ id: 'bk-1', base_price: '100', business_commission: '1' }] };
    }
    if (t.startsWith('SELECT id, base_price, business_commission FROM orders')) {
      return { rows: [] };
    }
    if (t.includes('pay_at_visit_commission_owed FROM businesses WHERE id')) {
      return { rows: [{ pay_at_visit_commission_owed: '0' }] };
    }
    if (t.includes("FROM bookings b JOIN listings l ON l.id = b.listing_id WHERE l.business_id = $1 AND b.status = 'cancelled'")) {
      return { rows: state.creditsStamped ? [] : [{ id: 'bk-cancel-1', refund_business_credit: '5' }] };
    }
    if (t.includes("FROM orders WHERE business_id = $1 AND status = 'cancelled'")) {
      return { rows: state.creditsStamped ? [] : [{ id: 'o-cancel-1', refund_business_credit: '3' }] };
    }
    if (t.includes('FROM returns r JOIN orders o ON o.id = r.order_id')) {
      return { rows: state.creditsStamped ? [] : [{ id: 'ret-1', refund_business_credit: '2' }] };
    }
    if (t.startsWith('INSERT INTO payouts')) {
      state.payoutInserts.push(params);
      return { rows: [{ id: 'payout-1', amount: params[5] }] };
    }
    if (t.startsWith('INSERT INTO payout_line_items')) {
      if (params[1]) state.bookingPaidOut = true; // booking_id line item
      return { rows: [] };
    }
    if (t.startsWith('UPDATE bookings SET refund_credit_payout_id') ||
        t.startsWith('UPDATE orders SET refund_credit_payout_id') ||
        t.startsWith('UPDATE returns SET deducted_from_payout_id')) {
      state.stampCalls.push({ text: t, params });
      state.creditsStamped = true;
      return { rows: [] };
    }
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] };
    if (t.startsWith('UPDATE businesses SET pay_at_visit_commission_owed')) return { rows: [] };

    throw new Error('unexpected query in fake pool: ' + t.slice(0, 90));
  }

  const client = { query, release() {} };
  const pool = { connect: async () => client, query };
  return { pool, query, state };
}

const fake = makeFakeDb();
mock.module(dbUrl, { exports: { pool: fake.pool, query: fake.query } });
mock.module(notifyUrl, { exports: { notify: async () => {} } });
const { runPayoutBatch } = await import('../src/services/payoutRun.js');

test('refund-fee credits (bookings + orders + returns) are summed into a payout once, then never again', async () => {
  const first = await runPayoutBatch();
  assert.equal(first.payouts_created, 1, 'one payout on the first run');

  const [businessId, gross, commission, dues, credits, net] = fake.state.payoutInserts[0];
  assert.equal(businessId, 'biz-1');
  assert.equal(Number(gross), 100);
  assert.equal(Number(commission), 1);
  assert.equal(Number(dues), 0);
  assert.equal(Number(credits), 10, 'cancelled booking 5 + cancelled order 3 + return 2');
  assert.equal(Number(net), 109, 'gross - commission + credits');

  // All three credit sources were stamped with the payout id.
  const stampedTables = fake.state.stampCalls.map((c) => c.text.split(' ')[1]);
  assert.deepEqual(stampedTables.sort(), ['bookings', 'orders', 'returns']);
  for (const c of fake.state.stampCalls) {
    assert.equal(c.params[0], 'payout-1');
  }

  // Second run: nothing left to pay out, nothing to re-credit.
  const second = await runPayoutBatch();
  assert.equal(second.payouts_created, 0, 'no double payout on the second run');
  assert.equal(fake.state.payoutInserts.length, 1, 'no second payout insert');
});
