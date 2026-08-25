// API client — every function here matches an actual endpoint built in
// backend/src/routes/. Field names match exactly what those routes expect
// and return, so there's no translation layer to get out of sync.

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

export async function createBooking({ listing_id, slot_start, slot_end, payment_method, promo_code }) {
  const res = await fetch(`${API_BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ listing_id, slot_start, slot_end, payment_method, promo_code: promo_code || undefined }),
  });
  return handleResponse(res);
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

export async function createOrder({ items, fulfillment_method, payment_method, promo_code }) {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ items, fulfillment_method, payment_method, promo_code: promo_code || undefined }),
  });
  return handleResponse(res);
}

export async function getMyOrders() {
  const res = await fetch(`${API_BASE}/api/orders/mine`, { headers: authHeaders() });
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