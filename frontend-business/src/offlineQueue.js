// Offline queue-and-retry for "mark fulfilled" / order-status actions —
// same mechanism as frontend-tourist's identical offlineQueue.js (booking/
// order submission there), mirrored per the original spec's "basic
// offline resilience... marking fulfilled" for this app. When a PATCH
// fails because the device has no signal, it's saved here instead of just
// failing, and automatically retried once connectivity returns.
// localStorage rather than IndexedDB — the payloads are small, and this
// needs to work from plain synchronous code in api/client.js without
// every caller becoming async-around-a-DB-open.

const STORAGE_KEY = 'atollisle_business_offline_queue';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private mode, full) — queuing just won't persist across a reload.
  }
}

// True for a fetch() rejection caused by no network reaching the server at
// all (offline, DNS failure, connection refused) — NOT for a request that
// reached the server and got a real 4xx/5xx back, which is a genuine
// error the caller should still surface normally.
export function isNetworkError(err) {
  return err instanceof TypeError || !navigator.onLine;
}

// kind: 'booking' | 'order' — which endpoint/creator function to retry
// with. Returns the queued entry (with a local id) so the UI can show it
// as "pending" immediately.
export function queueRequest(kind, payload) {
  const entry = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, payload, queuedAt: new Date().toISOString() };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function getQueuedRequests() {
  return readQueue();
}

export function removeQueuedRequest(id) {
  writeQueue(readQueue().filter((e) => e.id !== id));
}

// Registered once from main.jsx. `handlers` maps kind -> async fn(payload)
// that performs the real submission (the same createBooking/createOrder
// used for the online path) — kept as an injected map here rather than
// importing api/client.js directly, so this module has no circular
// dependency on the client that calls it.
export function startAutoRetry(handlers) {
  async function retryAll() {
    const queue = readQueue();
    for (const entry of queue) {
      const handler = handlers[entry.kind];
      if (!handler) continue;
      try {
        await handler(entry.payload);
        removeQueuedRequest(entry.id);
        window.dispatchEvent(new CustomEvent('atollisle:queued-request-sent', { detail: entry }));
      } catch (err) {
        if (!isNetworkError(err)) {
          // Reached the server this time and it was rejected for real
          // (e.g. the slot filled up while offline) — drop it rather than
          // retrying forever, and tell the UI so it can inform the user.
          removeQueuedRequest(entry.id);
          window.dispatchEvent(new CustomEvent('atollisle:queued-request-failed', { detail: { entry, error: err.message } }));
        }
        // else: still offline, leave it queued for the next 'online' event.
      }
    }
  }

  window.addEventListener('online', retryAll);
  if (navigator.onLine) retryAll();
}
