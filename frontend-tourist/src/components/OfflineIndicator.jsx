import { useState, useEffect } from 'react';
import { getQueuedRequests } from '../offlineQueue';

// Batch 32 — a persistent, always-visible status strip so a tourist at sea
// or on a remote island knows why things feel stuck. Reuses the same
// signals offlineQueue.js already runs on: navigator.onLine + the
// online/offline events, and the queued-request custom events it dispatches
// on retry. Three states:
//   offline            → calm navy strip, "you're offline"
//   online + queued > 0 → lagoon strip, "sending N queued…"
//   online + empty     → renders nothing
export default function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(() => getQueuedRequests().length);

  useEffect(() => {
    const refreshQueue = () => setQueued(getQueuedRequests().length);
    const goOnline = () => { setOnline(true); refreshQueue(); };
    const goOffline = () => { setOnline(false); refreshQueue(); };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('atollisle:queued-request-sent', refreshQueue);
    window.addEventListener('atollisle:queued-request-failed', refreshQueue);
    // Another tab draining the queue, or a booking screen adding to it.
    window.addEventListener('storage', refreshQueue);
    // The queue also grows from this tab without firing 'storage'; poll
    // lightly so the count doesn't sit stale after a failed submit.
    const poll = setInterval(refreshQueue, 4000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('atollisle:queued-request-sent', refreshQueue);
      window.removeEventListener('atollisle:queued-request-failed', refreshQueue);
      window.removeEventListener('storage', refreshQueue);
      clearInterval(poll);
    };
  }, []);

  if (online && queued === 0) return null;

  const syncing = online && queued > 0;
  const message = syncing
    ? `Back online — sending ${queued} queued ${queued === 1 ? 'request' : 'requests'}…`
    : queued > 0
      ? `You're offline. ${queued} ${queued === 1 ? 'request is' : 'requests are'} waiting and will send automatically when you're back online.`
      : "You're offline. Anything you book now will send automatically once you're back online.";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky', top: 0, zIndex: 250,
        background: syncing ? 'var(--lagoon)' : 'var(--ink)',
        color: 'var(--lagoon-light)',
        fontSize: 12, lineHeight: 1.4, fontWeight: 500,
        textAlign: 'center', padding: '6px 12px',
      }}
    >
      {message}
    </div>
  );
}
