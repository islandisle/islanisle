// Batch 38 — Pay at Visit eligibility gate (services/payAtVisit.js).
// Section 9 / [PHASE 2]: a user with pay_at_visit_eligible already true is
// always allowed; otherwise only their very first booking/order (across
// both tables) is exempt, everything after is gated.
//
// Uses node:test module mocking to stand in for ../config/db.js, so no
// database is needed. Run via `npm test` (which passes
// --experimental-test-module-mocks).

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const dbUrl = new URL('../src/config/db.js', import.meta.url).href;

// Mock once; each test swaps the query implementation and its call count.
let queryImpl = async () => ({ rows: [{ total: '0' }] });
let queryCalls = 0;
mock.module(dbUrl, {
  exports: {
    pool: {},
    query: async (...args) => { queryCalls += 1; return queryImpl(...args); },
  },
});
const { isPayAtVisitEligible } = await import('../src/services/payAtVisit.js');

test('eligible flag already set → allowed without touching the database', async () => {
  queryCalls = 0;
  queryImpl = async () => ({ rows: [{ total: '5' }] });
  assert.equal(await isPayAtVisitEligible('user-1', true), true);
  assert.equal(queryCalls, 0);
});

test('not-yet-eligible user with no prior bookings/orders → first one is exempt', async () => {
  queryImpl = async () => ({ rows: [{ total: '0' }] });
  assert.equal(await isPayAtVisitEligible('user-2', false), true);
});

test('not-yet-eligible user who already has activity → gated (blocked)', async () => {
  queryImpl = async () => ({ rows: [{ total: '2' }] });
  assert.equal(await isPayAtVisitEligible('user-3', false), false);
});
