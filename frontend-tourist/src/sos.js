import { sendSOS } from './api/client';

// One shared SOS path for both the Home corner button (Section 8.3) and the
// nav-menu "Send SOS alert" item — same confirm, same best-effort
// geolocation, same alert call, so there's only ever one SOS feature.
//
// `report({ phase, message })` is called as the flow progresses:
//   phase 'sending' -> request in flight
//   phase 'sent'    -> success (message is the server's confirmation text)
//   phase 'error'   -> failed (message is the error)
// A denied or unavailable location does NOT block the alert — an emergency
// alert with no coordinates still beats no alert at all.
export function runSOS({ island, report } = {}) {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (!window.confirm('Send an SOS alert with your location?')) return;
  }

  report?.({ phase: 'sending' });

  const finish = (latitude, longitude) => {
    sendSOS({ latitude, longitude, island })
      .then((res) => report?.({ phase: 'sent', message: res.message || 'Alert sent.' }))
      .catch((err) => report?.({ phase: 'error', message: err.message }));
  };

  if (!navigator.geolocation) {
    finish(null, null);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => finish(position.coords.latitude, position.coords.longitude),
    () => finish(null, null),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Ready-made `report` that surfaces the SOS flow through the app's toast —
// used by the nav-menu SOS item (both the shell's and Home's), which has no
// UI of its own for progress/result.
export function reportSOSToast(showToast) {
  return ({ phase, message }) => {
    if (phase === 'sending') showToast({ message: 'Sending SOS alert…' });
    else if (phase === 'sent') showToast({ message: message || 'SOS alert sent.' });
    else if (phase === 'error') showToast({ message: message || 'Could not send SOS alert.' });
  };
}
