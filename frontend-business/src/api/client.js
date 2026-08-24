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