const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('atollisle_agent_token');
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

// --- Auth (routes/agents.js) ---

export async function signup({ name, contact_email, password }) {
  const res = await fetch(`${API_BASE}/api/agents/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contact_email, password }),
  });
  return handleResponse(res);
}

export async function login({ contact_email, password }) {
  const res = await fetch(`${API_BASE}/api/agents/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_email, password }),
  });
  return handleResponse(res);
}

// --- Batch 26: searchable pickers (backend business.js / users.js) ---

export async function searchBusinesses(q) {
  const res = await fetch(`${API_BASE}/api/business/search?q=${encodeURIComponent(q || '')}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function lookupGuests(q) {
  const res = await fetch(`${API_BASE}/api/users/lookup?q=${encodeURIComponent(q || '')}`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Connections & availability ---

export async function connectToBusiness(businessId) {
  const res = await fetch(`${API_BASE}/api/agents/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ business_id: businessId }),
  });
  return handleResponse(res);
}

export async function getConnectedBusinesses() {
  const res = await fetch(`${API_BASE}/api/agents/businesses`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function checkAvailability(listingId, slotStart) {
  const params = new URLSearchParams({ listing_id: listingId, slot_start: slotStart });
  const res = await fetch(`${API_BASE}/api/agents/availability?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Bookings & commissions ---

// commission_rate is intentionally NOT sent — the backend sets it from what
// the business configured for this agent (agent_connected_businesses), and
// ignores anything in the request body. See routes/agents.js's POST /bookings.
export async function createAgentBooking({ business_id, listing_id, slot_start, slot_end, guest_user_id, guest_name }) {
  const res = await fetch(`${API_BASE}/api/agents/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ business_id, listing_id, slot_start, slot_end, guest_user_id, guest_name }),
  });
  return handleResponse(res);
}

export async function getMyAgentBookings() {
  const res = await fetch(`${API_BASE}/api/agents/bookings/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getMyCommissions() {
  const res = await fetch(`${API_BASE}/api/agents/commissions/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Chat (routes/messages.js) — generic, shared with tourist/business ---

export async function getMyThreads() {
  const res = await fetch(`${API_BASE}/api/messages/threads/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getThread(otherRole, otherId) {
  const params = new URLSearchParams({ other_role: otherRole, other_id: otherId });
  const res = await fetch(`${API_BASE}/api/messages/thread?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function sendMessage(otherRole, otherId, text) {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ other_role: otherRole, other_id: otherId, text }),
  });
  return handleResponse(res);
}

// --- Settings (routes/agents.js, routes/twoFactor.js) ---

export async function getMySettings() {
  const res = await fetch(`${API_BASE}/api/agents/me/settings`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateMySettings({ payout_bank_details }) {
  const res = await fetch(`${API_BASE}/api/agents/me/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ payout_bank_details }),
  });
  return handleResponse(res);
}

// Discovery profile (routes/agents.js PATCH /profile) — what tourists
// filter on in the "Find an agent" screen.
export async function updateMyProfile({ specialty, service_islands }) {
  const res = await fetch(`${API_BASE}/api/agents/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ specialty, service_islands }),
  });
  return handleResponse(res);
}

export async function setup2FA() {
  const res = await fetch(`${API_BASE}/api/2fa/setup`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

export async function confirm2FA(token) {
  const res = await fetch(`${API_BASE}/api/2fa/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ token }),
  });
  return handleResponse(res);
}

export async function disable2FA() {
  const res = await fetch(`${API_BASE}/api/2fa/disable`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}
