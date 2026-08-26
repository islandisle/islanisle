const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('atollisle_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function login({ contact_email, password }) {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_email, password }),
  });
  return handleResponse(res);
}

export async function getApprovalQueue() {
  const res = await fetch(`${API_BASE}/api/admin/approval-queue`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function approve(target_type, target_id) {
  const res = await fetch(`${API_BASE}/api/admin/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ target_type, target_id }),
  });
  return handleResponse(res);
}

export async function reclassifyToTourist(userId, reason) {
  const res = await fetch(`${API_BASE}/api/admin/local-verifications/${userId}/reclassify-tourist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function reject(target_type, target_id, reason) {
  const res = await fetch(`${API_BASE}/api/admin/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ target_type, target_id, reason }),
  });
  return handleResponse(res);
}

export async function getDisputes() {
  const res = await fetch(`${API_BASE}/api/admin/disputes`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function resolveDispute(id, outcome, resolution_note) {
  const res = await fetch(`${API_BASE}/api/admin/disputes/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ outcome, resolution_note }),
  });
  return handleResponse(res);
}

export async function suspendBusiness(id, reason) {
  const res = await fetch(`${API_BASE}/api/admin/businesses/${id}/suspend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function reinstateBusiness(id, reason) {
  const res = await fetch(`${API_BASE}/api/admin/businesses/${id}/reinstate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function markBusinessTrusted(id, reason) {
  const res = await fetch(`${API_BASE}/api/admin/businesses/${id}/mark-trusted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

// --- Agent directory + suspend/reinstate (routes/admin.js) ---

export async function getAgentDirectory({ search, status, page = 1 } = {}) {
  const params = new URLSearchParams({ page });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/admin/agents?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function suspendAgent(id, reason) {
  const res = await fetch(`${API_BASE}/api/admin/agents/${id}/suspend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function reinstateAgent(id, reason) {
  const res = await fetch(`${API_BASE}/api/admin/agents/${id}/reinstate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

// --- Audit log (routes/admin.js) ---

export async function getAuditLog({ page = 1 } = {}) {
  const params = new URLSearchParams({ page });
  const res = await fetch(`${API_BASE}/api/admin/audit-log?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Platform analytics (routes/admin.js) ---

export async function getPlatformAnalytics() {
  const res = await fetch(`${API_BASE}/api/admin/analytics`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Business directory (routes/admin.js) ---

export async function getBusinessDirectory({ search, status, page = 1 } = {}) {
  const params = new URLSearchParams({ page });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/admin/businesses?${params}`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Business/listing/staff detail preview (routes/business.js, businessSettings.js) ---
// Admin-readable versions of the business's own management endpoints —
// same routes the business dashboard uses, now also allowed for admin
// tokens (read-only; approval/suspension still only happen via /api/admin/*).

export async function getBusinessDetail(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/settings`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBusinessListingsDetail(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/listings`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getBusinessStaff(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/staff`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Payout run (routes/payouts.js) ---

export async function runPayouts() {
  const res = await fetch(`${API_BASE}/api/payouts/run`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// --- Support tickets (routes/support.js, routes/admin.js) ---

export async function getSupportTickets({ status, page = 1 } = {}) {
  const params = new URLSearchParams({ page });
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/admin/support-tickets?${params}`, { headers: authHeaders() });
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

export async function closeSupportTicket(id) {
  const res = await fetch(`${API_BASE}/api/support/tickets/${id}/close`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// --- Local events (routes/events.js) — Batch 19 local-knowledge calendar ---

export async function getEvents() {
  const res = await fetch(`${API_BASE}/api/events`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function createEvent({ island, title, description, event_date }) {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ island, title, description, event_date }),
  });
  return handleResponse(res);
}

export async function deleteEvent(id) {
  const res = await fetch(`${API_BASE}/api/events/${id}`, { method: 'DELETE', headers: authHeaders() });
  return handleResponse(res);
}

// --- Pay at Visit incidents (routes/admin.js) — Batch 23, not in the original spec ---

export async function getPayAtVisitIncidents() {
  const res = await fetch(`${API_BASE}/api/admin/pay-at-visit-incidents`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function restorePayAtVisit(userId, reason) {
  const res = await fetch(`${API_BASE}/api/admin/users/${userId}/restore-pay-at-visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}
