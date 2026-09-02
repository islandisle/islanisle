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
    // Some routes tag an error with a machine-readable `code` the UI keys
    // off (e.g. 'flight_ticket_required' → inline upload prompt at checkout
    // rather than a generic failure banner).
    if (data.code) error.code = data.code;
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

// Batch 20 — second step of login when login() above comes back with
// `requires_2fa: true` instead of a token.
export async function verifyLogin2FA(userId, token) {
  const res = await fetch(`${API_BASE}/api/auth/login/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, token }),
  });
  return handleResponse(res);
}

// Section 11's "change language later" — i18n.jsx's LanguageProvider calls
// this whenever a logged-in tourist switches languages from Profile.jsx.
export async function updateMyLanguage(language) {
  const res = await fetch(`${API_BASE}/api/auth/language`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ language }),
  });
  return handleResponse(res);
}

// Batch 19 — refreshes fields that change after login without a re-login
// (wallet_balance grows over time via services/loyalty.js).
export async function getMyProfile() {
  const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
  return handleResponse(res);
}

// Batch 20 — TOTP 2FA setup, mirroring frontend-agent's equivalents
// (backend/src/routes/twoFactor.js is shared across account types).
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

// Batch 40 — full atoll → island list for IslandPicker, built server-side
// from the external_places dataset + islands with real approved businesses.
export async function getIslands() {
  const res = await fetch(`${API_BASE}/api/islands`);
  return handleResponse(res);
}

export async function getIslandListings(island, type, accessibilityFeatures, dietaryTags, atoll) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  // atoll disambiguates same-named islands in different atolls (e.g.
  // Maalhos in both Alifu Alifu and Baa) — see listings.js's route comment.
  if (atoll) params.set('atoll', atoll);
  if (accessibilityFeatures && accessibilityFeatures.length > 0) {
    params.set('accessibility', accessibilityFeatures.join(','));
  }
  if (dietaryTags && dietaryTags.length > 0) {
    params.set('dietary', dietaryTags.join(','));
  }
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/islands/${encodeURIComponent(island)}/listings${qs ? `?${qs}` : ''}`);
  return handleResponse(res);
}

// Batch 25 — real Ministry of Tourism registered places near this island
// that aren't registered on the platform yet ("More on this island").
// Works for a guest same as real listings do; contact_locked in the
// response tells the frontend whether to show phone/email or a locked
// placeholder — the backend has already stripped them server-side when
// locked, not just hidden them here.
export async function getExternalPlaces(island, atoll) {
  // ?atoll disambiguates same-named islands in different atolls — see
  // externalPlaces.js's route comment.
  const qs = atoll ? `?atoll=${encodeURIComponent(atoll)}` : '';
  const res = await fetch(`${API_BASE}/api/external-places/${encodeURIComponent(island)}${qs}`, { headers: authHeaders() });
  return handleResponse(res);
}

// Favorites (routes/favorites.js)

export async function getMyFavorites() {
  const res = await fetch(`${API_BASE}/api/favorites/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getMyFavoriteIds() {
  const res = await fetch(`${API_BASE}/api/favorites/ids`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function addFavorite(listingId) {
  const res = await fetch(`${API_BASE}/api/favorites/${listingId}`, { method: 'POST', headers: authHeaders() });
  return handleResponse(res);
}

export async function removeFavorite(listingId) {
  const res = await fetch(`${API_BASE}/api/favorites/${listingId}`, { method: 'DELETE', headers: authHeaders() });
  return handleResponse(res);
}

// Local events calendar (routes/events.js) — part of Batch 19's local
// knowledge guide.
export async function getLocalEvents(island) {
  const params = new URLSearchParams();
  if (island) params.set('island', island);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/events${qs ? `?${qs}` : ''}`);
  return handleResponse(res);
}

// Global search (Batch 19) — across every island at once, not just the
// currently selected one.
export async function searchListings(q) {
  const res = await fetch(`${API_BASE}/api/islands/search?q=${encodeURIComponent(q)}`);
  return handleResponse(res);
}

export async function getListingDetail(id) {
  const res = await fetch(`${API_BASE}/api/islands/detail/${id}`);
  return handleResponse(res);
}

// Section 8.4: upcoming/active closures for the listing's business — shown
// as a banner on ListingDetail.jsx ("closed with the stated reason rather
// than being hidden").
export async function getBusinessClosures(businessId) {
  const res = await fetch(`${API_BASE}/api/business/${businessId}/closures`);
  return handleResponse(res);
}

export async function getArrivalTransfers(destination) {
  const res = await fetch(`${API_BASE}/api/islands/arrivals?destination=${encodeURIComponent(destination)}`);
  return handleResponse(res);
}

export async function getIslandTransfers(origin, destination) {
  const res = await fetch(
    `${API_BASE}/api/islands/transfers?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
  );
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

export async function getCancelPreview(id) {
  const res = await fetch(`${API_BASE}/api/bookings/${id}/cancel-preview`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function cancelBooking(id) {
  // cancelled_by is derived server-side from who's actually calling (the
  // booking's own tourist, or the owning business) — see bookings.js's
  // PATCH /:id/cancel — not taken from the client.
  const res = await fetch(`${API_BASE}/api/bookings/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  return handleResponse(res);
}

// --- Flight ticket (routes/users.js) ---

// Multipart upload of arrival proof — needed before booking on an island
// other than the one the tourist is currently checked in on (backend's
// middleware/flightTicketGate.js). Same multipart shape as signup() /
// submitReview() above: no Content-Type header, fetch sets the boundary.
export async function uploadFlightTicket(file) {
  const formData = new FormData();
  formData.append('ticket', file);
  const res = await fetch(`${API_BASE}/api/users/flight-ticket`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
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

// Batch 24 — Home.jsx's trip-stage-aware content prioritization.
export async function getTripContext() {
  const res = await fetch(`${API_BASE}/api/trips/context`, { headers: authHeaders() });
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

// Batch 22 — the backend route existed with nothing in the UI ever
// calling it, so a filed dispute had no way to be tracked afterward.
export async function getMyDisputes() {
  const res = await fetch(`${API_BASE}/api/disputes/mine`, { headers: authHeaders() });
  return handleResponse(res);
}

// --- Reviews (routes/reviews.js) ---

// multipart/form-data — Section 6.4's review photos. photos is an array of
// File objects from an <input type="file" multiple>, optional.
export async function submitReview({ booking_id, order_id, rating, text, photos }) {
  const formData = new FormData();
  if (booking_id) formData.append('booking_id', booking_id);
  if (order_id) formData.append('order_id', order_id);
  formData.append('rating', rating);
  if (text) formData.append('text', text);
  for (const file of photos || []) {
    formData.append('photos', file);
  }
  const res = await fetch(`${API_BASE}/api/reviews`, {
    method: 'POST',
    headers: authHeaders(), // no Content-Type — fetch sets the multipart boundary itself
    body: formData,
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

export async function getWeatherForecast(atoll) {
  const res = await fetch(`${API_BASE}/api/weather/${encodeURIComponent(atoll)}/forecast`);
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

// Batch 31 — the "Undo" for a just-tapped notification.
export async function markNotificationUnread(id) {
  const res = await fetch(`${API_BASE}/api/notifications/${id}/unread`, {
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

// Section 11's per-category mute controls.
export async function getNotificationPreferences() {
  const res = await fetch(`${API_BASE}/api/notifications/preferences`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateNotificationPreferences(preferences) {
  const res = await fetch(`${API_BASE}/api/notifications/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ preferences }),
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

// --- Chat (routes/messages.js) — generic, shared with the agent portal ---
// Section 6.5's tourist↔business chat: the backend was already generic and
// already used by frontend-agent; this is the same client shape, for a
// tourist messaging a business OR an agent (Batch 22 generalized
// ChatPanel.jsx beyond business-only).

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

// Batch 22 — a tourist had no way to see threads an agent (or a business)
// started, only ones they themselves opened via a specific listing.
export async function getMyThreads() {
  const res = await fetch(`${API_BASE}/api/messages/threads/mine`, { headers: authHeaders() });
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

// --- Travel agents (routes/agents.js search + routes/users.js assignment) ---
// "Find an agent" — search, then chat (reuse ChatPanel with otherRole
// 'agent') or assign one. Once assigned, prices for businesses that agent
// is approved-connected to come back already marked up from the backend —
// there's nothing to render differently here, it's just "the price."

export async function searchAgents({ q, specialty, island } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (specialty) params.set('specialty', specialty);
  if (island) params.set('island', island);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/agents/search${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getAssignedAgent() {
  const res = await fetch(`${API_BASE}/api/users/assigned-agent`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function assignAgent(agentId) {
  const res = await fetch(`${API_BASE}/api/users/assign-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ agent_id: agentId }),
  });
  return handleResponse(res);
}

export async function unassignAgent() {
  const res = await fetch(`${API_BASE}/api/users/unassign-agent`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// --- Go Social (routes/social*.js) ---

export async function getSocialProfile(userId) {
  const path = userId ? `/api/social/profiles/${userId}` : '/api/social/profiles/me';
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateSocialProfile({ bio, avatar_url }) {
  const body = {};
  if (bio !== undefined) body.bio = bio;
  if (avatar_url !== undefined) body.avatar_url = avatar_url;
  const res = await fetch(`${API_BASE}/api/social/profiles/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

async function socialJson(path, method, body) {
  const res = await fetch(`${API_BASE}/api/social${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse(res);
}

export function createPost({ caption, images }) {
  return socialJson('/posts', 'POST', { caption, images });
}

export async function getSocialFeed({ before, limit } = {}) {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/api/social/posts/feed${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getUserPosts(userId) {
  const res = await fetch(`${API_BASE}/api/social/posts/user/${userId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getPost(id) {
  const res = await fetch(`${API_BASE}/api/social/posts/${id}`, { headers: authHeaders() });
  return handleResponse(res);
}

export const deletePost = (id) => socialJson(`/posts/${id}`, 'DELETE');
export const likePost = (id) => socialJson(`/posts/${id}/like`, 'POST');
export const unlikePost = (id) => socialJson(`/posts/${id}/like`, 'DELETE');

export async function getPostComments(id) {
  const res = await fetch(`${API_BASE}/api/social/posts/${id}/comments`, { headers: authHeaders() });
  return handleResponse(res);
}

export const addPostComment = (id, text) => socialJson(`/posts/${id}/comments`, 'POST', { text });
export const deletePostComment = (id, commentId) => socialJson(`/posts/${id}/comments/${commentId}`, 'DELETE');

export async function searchFriends(q) {
  const res = await fetch(`${API_BASE}/api/social/friends/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  return handleResponse(res);
}

export const sendFriendRequest = (toUserId) => socialJson('/friends/requests', 'POST', { to_user_id: toUserId });

export async function getIncomingFriendRequests() {
  const res = await fetch(`${API_BASE}/api/social/friends/requests/incoming`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getFriendRequestCount() {
  const res = await fetch(`${API_BASE}/api/social/friends/requests/count`, { headers: authHeaders() });
  return handleResponse(res);
}

export const acceptFriendRequest = (id) => socialJson(`/friends/requests/${id}/accept`, 'POST');
export const declineFriendRequest = (id) => socialJson(`/friends/requests/${id}/decline`, 'POST');

export async function getFriends() {
  const res = await fetch(`${API_BASE}/api/social/friends`, { headers: authHeaders() });
  return handleResponse(res);
}

export const unfriend = (userId) => socialJson(`/friends/${userId}`, 'DELETE');

export const createStory = ({ image, caption }) => socialJson('/stories', 'POST', { image, caption });

export async function getStoriesFeed() {
  const res = await fetch(`${API_BASE}/api/social/stories/feed`, { headers: authHeaders() });
  return handleResponse(res);
}

export const viewStory = (id) => socialJson(`/stories/${id}/view`, 'POST');
export const deleteStory = (id) => socialJson(`/stories/${id}`, 'DELETE');

export async function getStoryViewers(id) {
  const res = await fetch(`${API_BASE}/api/social/stories/${id}/viewers`, { headers: authHeaders() });
  return handleResponse(res);
}