// API client — every function here matches an actual endpoint built in
// backend/src/routes/. Field names match exactly what those routes expect
// and return, so there's no translation layer to get out of sync.

import { isNetworkError, queueRequest } from '../offlineQueue';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('atollisle_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// --- Auth (routes/auth.js) ---

export async function signup(formData) {
  // formData is a FormData instance — the signup endpoint is multipart
  // because it includes the document image file (Section 2.1).
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse(res);
}

export async function login({ contact_email, contact_mobile, password }) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_email, contact_mobile, password }),
  });
  return handleResponse(res);
}

// --- Biometric login (routes/webauthn.js) — additional login option
// alongside the password above, not a replacement ---

export async function getWebauthnRegisterOptions() {
  const res = await fetch(`${API_BASE}/api/auth/webauthn/register-options`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function submitWebauthnRegistration(response, deviceLabel) {
  const res = await fetch(`${API_BASE}/api/auth/webauthn/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ response, device_label: deviceLabel }),
  });
  return handleResponse(res);
}

export async function getMyWebauthnCredentials() {
  const res = await fetch(`${API_BASE}/api/auth/webauthn/credentials/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function removeWebauthnCredential(id) {
  const res = await fetch(`${API_BASE}/api/auth/webauthn/credentials/${id}`, { method: 'DELETE', headers: authHeaders() });
  return handleResponse(res);
}

export async function getWebauthnLoginOptions({ contact_email, contact_mobile }) {
  const res = await fetch(`${API_BASE}/api/auth/webauthn/login-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_email, contact_mobile }),
  });
  return handleResponse(res);
}

export async function submitWebauthnLogin(userId, response) {
  const res = await fetch(`${API_BASE}/api/auth/webauthn/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, response }),
  });
  return handleResponse(res);
}

// --- Islands / listings (routes/listings.js) ---

export async function getIslandListings(island, type) {
  const params = type ? `?type=${encodeURIComponent(type)}` : '';
  const res = await fetch(`${API_BASE}/api/islands/${encodeURIComponent(island)}/listings${params}`);
  return handleResponse(res);
}

export async function getListingDetail(id) {
  const res = await fetch(`${API_BASE}/api/islands/detail/${id}`);
  return handleResponse(res);
}

export async function getArrivalTransfers(destination) {
  const res = await fetch(`${API_BASE}/api/islands/arrivals?destination=${encodeURIComponent(destination)}`);
  return handleResponse(res);
}

// --- Bookings (routes/bookings.js) ---

// The actual network call — also used directly as the retry handler for
// offlineQueue.js's auto-retry (see main.jsx), so a queued booking is
// resubmitted through the exact same path as a normal one.
export async function createBookingRaw(payload) {
  const res = await fetch(`${API_BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...payload, promo_code: payload.promo_code || undefined }),
  });
  return handleResponse(res);
}

// Offline-aware wrapper: if the request never reached the server at all
// (no signal — the common case at sea/on a remote island, not a rejected
// request), it's queued for automatic retry instead of just failing. The
// caller gets back { queued: true } instead of a thrown error so the UI
// can show "we'll submit this once you're back online" rather than a
// generic failure.
export async function createBooking(payload) {
  try {
    return await createBookingRaw(payload);
  } catch (err) {
    if (isNetworkError(err)) {
      const entry = queueRequest('booking', payload);
      return { queued: true, queuedId: entry.id, message: "You're offline — this booking will be submitted automatically once you're back online." };
    }
    throw err;
  }
}

export async function getMyBookings() {
  const res = await fetch(`${API_BASE}/api/bookings/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function cancelBooking(id, cancelled_by = 'user') {
  const res = await fetch(`${API_BASE}/api/bookings/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ cancelled_by }),
  });
  return handleResponse(res);
}

// --- Guesthouse check-in (routes/checkin.js) ---

export async function getCurrentStay() {
  const res = await fetch(`${API_BASE}/api/checkin/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Trips (routes/trips.js) ---

export async function getMyTrips() {
  const res = await fetch(`${API_BASE}/api/trips/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Orders (routes/orders.js) — shop purchases: stock-based, not slot-based ---

export async function createOrderRaw(payload) {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      ...payload,
      promo_code: payload.promo_code || undefined,
      delivery_island: payload.delivery_island || undefined,
      handover_method: payload.handover_method || undefined,
    }),
  });
  return handleResponse(res);
}

// See createBooking's identical wrapper above for why this exists.
export async function createOrder(payload) {
  try {
    return await createOrderRaw(payload);
  } catch (err) {
    if (isNetworkError(err)) {
      const entry = queueRequest('order', payload);
      return { queued: true, queuedId: entry.id, message: "You're offline — this order will be submitted automatically once you're back online." };
    }
    throw err;
  }
}

export async function getMyOrders() {
  const res = await fetch(`${API_BASE}/api/orders/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// Cross-island delivery preview for the product/purchase screen.
export async function checkDelivery(listingId, deliveryIsland) {
  const params = new URLSearchParams({ listing_id: listingId, delivery_island: deliveryIsland });
  const res = await fetch(`${API_BASE}/api/orders/delivery-check?${params}`);
  return handleResponse(res);
}

// --- Returns / exchanges (routes/returns.js) ---

export async function requestReturn({ order_id, type, reason }) {
  const res = await fetch(`${API_BASE}/api/returns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ order_id, type, reason }),
  });
  return handleResponse(res);
}

export async function getMyReturns() {
  const res = await fetch(`${API_BASE}/api/returns/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Disputes (routes/disputes.js) ---

export async function fileDispute({ booking_id, order_id, reason, description }) {
  const res = await fetch(`${API_BASE}/api/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ booking_id, order_id, reason, description }),
  });
  return handleResponse(res);
}

// --- Reviews (routes/reviews.js) ---

export async function submitReview({ booking_id, order_id, rating, text }) {
  const res = await fetch(`${API_BASE}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ booking_id, order_id, rating, text }),
  });
  return handleResponse(res);
}

export async function getMyReviews() {
  const res = await fetch(`${API_BASE}/api/reviews/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBusinessReviews(businessId, page = 1) {
  const res = await fetch(`${API_BASE}/api/reviews/business/${businessId}?page=${page}`);
  return handleResponse(res);
}

// --- Waitlist (routes/waitlist.js) ---

export async function joinWaitlist({ listing_id, requested_slot }) {
  const res = await fetch(`${API_BASE}/api/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ listing_id, requested_slot }),
  });
  return handleResponse(res);
}

export async function getMyWaitlist() {
  const res = await fetch(`${API_BASE}/api/waitlist/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Weather (routes/weather.js) ---

export async function getWeather(atoll) {
  const res = await fetch(`${API_BASE}/api/weather/${encodeURIComponent(atoll)}`);
  return handleResponse(res);
}

// --- Notifications (routes/notifications.js) ---

export async function getNotifications(page = 1) {
  const res = await fetch(`${API_BASE}/api/notifications?page=${page}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function markNotificationRead(id) {
  const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${API_BASE}/api/notifications/read-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({}),
  });
  return handleResponse(res);
}

// --- Support (routes/support.js) ---

export async function openSupportTicket({ subject, message }) {
  const res = await fetch(`${API_BASE}/api/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ subject, message }),
  });
  return handleResponse(res);
}

export async function getMySupportTickets() {
  const res = await fetch(`${API_BASE}/api/support/tickets/mine`, { headers: authHeaders() });
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

// --- SOS (routes/sos.js) ---

export async function sendSOS({ latitude, longitude, island }) {
  const res = await fetch(`${API_BASE}/api/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ latitude, longitude, island }),
  });
  return handleResponse(res);
}

// --- Travel groups (routes/groups.js) ---

export async function getMyGroup() {
  const res = await fetch(`${API_BASE}/api/groups/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function joinGroup(groupCode) {
  const res = await fetch(`${API_BASE}/api/groups/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ group_code: groupCode }),
  });
  return handleResponse(res);
}

export async function removeGroupMember(groupId, memberId) {
  const res = await fetch(`${API_BASE}/api/groups/${groupId}/members/${memberId}/remove`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// --- Account (routes/legal.js) ---

export async function exportMyData() {
  const res = await fetch(`${API_BASE}/api/account/export`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function deleteAccount(password) {
  const res = await fetch(`${API_BASE}/api/account/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ password, confirmation: 'DELETE' }),
  });
  return handleResponse(res);
}