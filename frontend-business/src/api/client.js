import { isNetworkError, queueRequest } from '../offlineQueue';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('atollisle_business_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// User login is shared with the tourist app's auth (a business account is
// owned by a regular user account — see backend/src/routes/business.js).
export async function login({ contact_email, password }) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_email, password }),
  });
  return handleResponse(res);
}

// Separate from the owner login above — see businessSettings.js's
// staff-login route for why staff accounts need their own token shape.
// Uses the same 'atollisle_business_token' storage slot as the owner
// session so every existing authHeaders()-based API call (getArrivals,
// checkInBooking, etc.) works unmodified for a logged-in staff member.
export async function staffLogin({ login_email, password }) {
  const res = await fetch(`${API_BASE}/api/business/staff-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_email, password }),
  });
  return handleResponse(res);
}

export async function createBusiness({ type, name, location_island, location_atoll }) {
  const res = await fetch(`${API_BASE}/api/business/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ type, name, location_island, location_atoll }),
  });
  return handleResponse(res);
}

// Batch 40 — full atoll → island list for IslandPicker, built server-side
// from external_places + islands with real approved businesses. Public,
// no auth needed.
export async function getIslands() {
  const res = await fetch(`${API_BASE}/api/islands`);
  return handleResponse(res);
}

export async function getMyListings(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/listings`, { headers: authHeaders() });
  return handleResponse(res);
}

// multipart/form-data now (photos — Section 6.4) — object/array fields are
// JSON-encoded as strings, the backend (business.js) parses them back out.
// `listing.photos` is an array of File objects from an <input type="file"
// multiple>, appended individually under the same 'photos' field name.
export async function createListing(businessId, listing) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(listing)) {
    if (key === 'photos') continue;
    if (value == null) continue;
    formData.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
  }
  for (const file of listing.photos || []) {
    formData.append('photos', file);
  }
  const res = await fetch(`${API_BASE}/api/business/${businessId}/listings`, {
    method: 'POST',
    headers: authHeaders(), // no Content-Type — fetch sets the multipart boundary itself
    body: formData,
  });
  return handleResponse(res);
}

export async function getSettings(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/settings`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBillingHistory(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/billing-history`, { headers: authHeaders() });
  return handleResponse(res);
}

// Batch 23 (not in the original spec) — this business's own history of
// Pay at Visit non-payment incidents it reported.
export async function getPayAtVisitIncidents(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/pay-at-visit-incidents`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getAnalytics(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/analytics`, { headers: authHeaders() });
  return handleResponse(res);
}

// Batch 33 — threshold nudges ("fully booked for the next 7 days").
export async function getAvailabilitySummary(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/availability-summary`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- External places / claim flow (routes/externalPlaces.js) — Batch 25, not in the original spec ---

export async function getExternalPlaces(island, atoll) {
  // ?atoll disambiguates same-named islands in different atolls — see
  // externalPlaces.js's route comment.
  const qs = atoll ? `?atoll=${encodeURIComponent(atoll)}` : '';
  const res = await fetch(`${API_BASE}/api/external-places/${encodeURIComponent(island)}${qs}`, { headers: authHeaders() });
  return handleResponse(res);
}

// multipart/form-data — `document` is a required File (business
// registration certificate), same blocking-upload pattern as
// auth.js's signup document gate.
export async function claimExternalPlace(placeId, claim) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(claim)) {
    if (key === 'document' || value == null) continue;
    formData.append(key, value);
  }
  if (claim.document) formData.append('document', claim.document);

  const res = await fetch(`${API_BASE}/api/external-places/${placeId}/claim`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return handleResponse(res);
}

export async function updateSettings(businessId, updates) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

export async function getPayouts() {
  const res = await fetch(`${API_BASE}/api/payouts/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// paymentCollected (Batch 23) defaults true — omit it entirely for the
// normal case, matching what the backend already defaults to.
export async function markBookingFulfilledRaw(bookingId, paymentCollected = true) {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ payment_collected: paymentCollected }),
  });
  return handleResponse(res);
}

// Offline-aware wrapper — see offlineQueue.js. If the front desk marks a
// booking fulfilled with no signal, it's queued and retried automatically
// once connectivity returns instead of just failing.
export async function markBookingFulfilled(bookingId, paymentCollected = true) {
  try {
    return await markBookingFulfilledRaw(bookingId, paymentCollected);
  } catch (err) {
    if (isNetworkError(err)) {
      queueRequest('markBookingFulfilled', { bookingId, paymentCollected });
      return { queued: true, message: "You're offline — this will be marked fulfilled automatically once you're back online." };
    }
    throw err;
  }
}

// --- Incoming bookings & orders (routes/bookings.js, routes/orders.js) ---

export async function getBusinessBookings(businessId) {
  const res = await fetch(`${API_BASE}/api/bookings/business/${businessId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBusinessOrders(businessId) {
  const res = await fetch(`${API_BASE}/api/orders/business/${businessId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function markOrderStatusRaw(orderId, status, paymentCollected = true) {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status, payment_collected: paymentCollected }),
  });
  return handleResponse(res);
}

// See markBookingFulfilled's identical wrapper above for why this exists.
export async function markOrderStatus(orderId, status, paymentCollected = true) {
  try {
    return await markOrderStatusRaw(orderId, status, paymentCollected);
  } catch (err) {
    if (isNetworkError(err)) {
      queueRequest('markOrderStatus', { orderId, status, paymentCollected });
      return { queued: true, message: "You're offline — this status update will be sent automatically once you're back online." };
    }
    throw err;
  }
}

// --- Returns / exchanges (routes/returns.js) ---

export async function getBusinessReturns(businessId) {
  const res = await fetch(`${API_BASE}/api/returns/business/${businessId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function approveReturn(returnId) {
  const res = await fetch(`${API_BASE}/api/returns/${returnId}/approve`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

export async function rejectReturn(returnId, reason) {
  const res = await fetch(`${API_BASE}/api/returns/${returnId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function processReturn(returnId) {
  const res = await fetch(`${API_BASE}/api/returns/${returnId}/process`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

// --- Reviews (routes/reviews.js) ---

export async function getBusinessReviews(businessId, page = 1) {
  const res = await fetch(`${API_BASE}/api/reviews/business/${businessId}?page=${page}`);
  return handleResponse(res);
}

// --- Promo codes (routes/businessSettings.js) ---

export async function getPromoCodes(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/promo-codes`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createPromoCode(businessId, { code, discount_type, discount, valid_from, valid_to, usage_limit }) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/promo-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ code, discount_type, discount, valid_from, valid_to, usage_limit }),
  });
  return handleResponse(res);
}

export async function updatePromoCode(businessId, codeId, updates) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/promo-codes/${codeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

// --- Support (routes/support.js) ---

export async function openSupportTicket(businessId, { subject, message }) {
  const res = await fetch(`${API_BASE}/api/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ business_id: businessId, subject, message }),
  });
  return handleResponse(res);
}

export async function getMySupportTickets(businessId) {
  const res = await fetch(`${API_BASE}/api/support/tickets/mine?business_id=${businessId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getSupportTicket(id) {
  const res = await fetch(`${API_BASE}/api/support/tickets/${id}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function replyToSupportTicket(id, text) {
  const res = await fetch(`${API_BASE}/api/support/tickets/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  return handleResponse(res);
}

// --- Notifications (routes/notifications.js) ---

export async function getNotifications(businessId, page = 1) {
  const res = await fetch(`${API_BASE}/api/notifications?business_id=${businessId}&page=${page}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function markNotificationRead(id) {
  const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function markAllNotificationsRead(businessId) {
  const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ business_id: businessId }),
  });
  return handleResponse(res);
}

// --- Guesthouse check-in (routes/checkin.js) ---

export async function getArrivals(businessId) {
  const res = await fetch(`${API_BASE}/api/checkin/business/${businessId}/arrivals`, { headers: authHeaders() });
  return handleResponse(res);
}

// Batch 21 — the guest source for the shared GuestPicker component.
export async function getCurrentGuests(businessId) {
  const res = await fetch(`${API_BASE}/api/checkin/business/${businessId}/current-guests`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function checkInBooking(bookingId, { method, room_number, whole_group, member_ids }) {
  const res = await fetch(`${API_BASE}/api/checkin/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ method, room_number, whole_group, member_ids }),
  });
  return handleResponse(res);
}

// document_access_grants (Batch 19) — only returns anything for a guest
// checked in at this business, for exactly this booking.
export async function getBookingDocuments(bookingId) {
  const res = await fetch(`${API_BASE}/api/checkin/booking/${bookingId}/documents`, { headers: authHeaders() });
  return handleResponse(res);
}

// Section 6.5's ETA-update — one departure's confirmed passengers, notified
// at once (routes/bookings.js).
export async function sendEtaUpdate(listingId, slotStart, message) {
  const res = await fetch(`${API_BASE}/api/bookings/departure/eta-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ listing_id: listingId, slot_start: slotStart, message }),
  });
  return handleResponse(res);
}

// --- Disputes (routes/disputes.js) ---

// business_id is required here (unlike frontend-tourist's own fileDispute)
// so the backend records raised_by: 'business' — see disputes.js.
export async function fileDispute(businessId, { booking_id, order_id, reason, description }) {
  const res = await fetch(`${API_BASE}/api/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ booking_id, order_id, reason, description, business_id: businessId }),
  });
  return handleResponse(res);
}

export async function getMyDisputes() {
  const res = await fetch(`${API_BASE}/api/disputes/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Restaurant manual accept/reject (routes/bookings.js) ---

export async function approveReservation(bookingId) {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/approve-reservation`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function rejectReservation(bookingId, reason) {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/reject-reservation`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

// --- Staff accounts (routes/businessSettings.js) ---

export async function getStaff(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/staff`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function addStaff(businessId, { name, login_email, temp_password, permission_level }) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, login_email, temp_password, permission_level }),
  });
  return handleResponse(res);
}

export async function revokeStaff(businessId, staffId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/staff/${staffId}/revoke`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// --- Connected agents (routes/businessSettings.js) ---

export async function getConnectedAgents(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/agents`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateAgentCommissionRate(businessId, agentId, commissionRate) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/agents/${agentId}/commission-rate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ commission_rate: commissionRate }),
  });
  return handleResponse(res);
}

// --- Closures (routes/closures.js) ---

export async function getClosures(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/closures`);
  return handleResponse(res);
}

export async function addClosure(businessId, { start_date, end_date, reason }) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/closures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ start_date, end_date, reason }),
  });
  return handleResponse(res);
}

export async function removeClosure(businessId, closureId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/closures/${closureId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// --- Payout itemization (routes/payouts.js) ---

export async function getPayoutItems(payoutId) {
  const res = await fetch(`${API_BASE}/api/payouts/${payoutId}/items`, { headers: authHeaders() });
  return handleResponse(res);
}
// --- Batch 26: searchable pickers (backend business.js / users.js) ---

export async function searchBusinesses({ q, type, island } = {}) {
  const params = new URLSearchParams({ q: q || '' });
  if (type) params.set('type', type);
  if (island) params.set('island', island);
  const res = await fetch(`${API_BASE}/api/business/search?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBusinessCatalog(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/catalog`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function searchListings({ q, type } = {}) {
  const params = new URLSearchParams({ q: q || '' });
  if (type) params.set('type', type);
  const res = await fetch(`${API_BASE}/api/business/listings/search?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function lookupGuests(q) {
  const res = await fetch(`${API_BASE}/api/users/lookup?q=${encodeURIComponent(q || '')}`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- B2B requests + standing discounts (routes/b2b.js) — Batch 19 ---

export async function getStandingDiscounts(businessId) {
  const res = await fetch(`${API_BASE}/api/b2b/standing-discounts/${businessId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createStandingDiscount(businessId, { partner_business_id, discount_percent }) {
  const res = await fetch(`${API_BASE}/api/b2b/standing-discounts/${businessId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ partner_business_id, discount_percent }),
  });
  return handleResponse(res);
}

export async function deleteStandingDiscount(businessId, discountId) {
  const res = await fetch(`${API_BASE}/api/b2b/standing-discounts/${businessId}/${discountId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function createB2BRequest(businessId, payload) {
  const res = await fetch(`${API_BASE}/api/b2b/requests/${businessId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function getOutgoingB2BRequests(businessId) {
  const res = await fetch(`${API_BASE}/api/b2b/requests/${businessId}/outgoing`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getIncomingB2BRequests(businessId) {
  const res = await fetch(`${API_BASE}/api/b2b/requests/${businessId}/incoming`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function acceptB2BRequest(requestId) {
  const res = await fetch(`${API_BASE}/api/b2b/requests/${requestId}/accept`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

export async function rejectB2BRequest(requestId) {
  const res = await fetch(`${API_BASE}/api/b2b/requests/${requestId}/reject`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

// --- Guesthouse-arranged guest transfers (routes/groupTransfers.js) — Batch 19 ---

export async function createGroupTransfer(guesthouseBusinessId, payload) {
  const res = await fetch(`${API_BASE}/api/group-transfers/${guesthouseBusinessId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function getMyGroupTransfers(guesthouseBusinessId) {
  const res = await fetch(`${API_BASE}/api/group-transfers/${guesthouseBusinessId}/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getGroupTransferManifest(speedboatBusinessId) {
  const res = await fetch(`${API_BASE}/api/group-transfers/business/${speedboatBusinessId}/manifest`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function boardGroupTransferGuestByBooking(bookingId) {
  const res = await fetch(`${API_BASE}/api/group-transfers/board`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ booking_id: bookingId }),
  });
  return handleResponse(res);
}

export async function boardGroupTransferGuest(guestId) {
  const res = await fetch(`${API_BASE}/api/group-transfers/guests/${guestId}/board`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

export async function markGroupTransferGuestNoShow(guestId) {
  const res = await fetch(`${API_BASE}/api/group-transfers/guests/${guestId}/no-show`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}
