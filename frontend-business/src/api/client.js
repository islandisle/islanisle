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

export async function createBusiness({ type, name, location_island }) {
  const res = await fetch(`${API_BASE}/api/business/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ type, name, location_island }),
  });
  return handleResponse(res);
}

export async function getMyListings(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/listings`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createListing(businessId, listing) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(listing),
  });
  return handleResponse(res);
}

export async function getSettings(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/settings`, { headers: authHeaders() });
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

export async function markBookingFulfilled(bookingId) {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/complete`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  return handleResponse(res);
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

export async function markOrderStatus(orderId, status) {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
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

export async function checkInBooking(bookingId, { method, room_number, whole_group, member_ids }) {
  const res = await fetch(`${API_BASE}/api/checkin/${bookingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ method, room_number, whole_group, member_ids }),
  });
  return handleResponse(res);
}