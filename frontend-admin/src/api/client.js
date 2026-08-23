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
