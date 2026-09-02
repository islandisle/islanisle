// Shared tourist navigation — the single source for both the persistent
// AppShell hamburger menu (every sub-page) and Home's header menu, so every
// screen opens the same list in the same order.
//
// NAV_LINKS was previously a `NAV_ITEMS` const inside Home.jsx (Batch 27),
// which is why the menu only existed on Home. It now lives here and is
// rendered by the shared shell instead.

export const NAV_LINKS = [
  { to: '/', end: true, label: 'Home', icon: 'home' },
  { to: '/bookings', label: 'My bookings & orders', icon: 'bookings' },
  { to: '/trips', label: 'My trips', icon: 'trips' },
  { to: '/favorites', label: 'Favorites', icon: 'favorites' },
  { to: '/messages', label: 'Messages', icon: 'messages' },
  { to: '/social', label: 'Go Social', icon: 'social' },
  { to: '/find-agent', label: 'Find an agent', icon: 'guests' },
  { to: '/transfers', label: 'Arrival transfers', icon: 'transfers' },
  { to: '/local-guide', label: 'Local guide', icon: 'guide' },
  { to: '/emergency-contacts', label: 'Emergency contacts', icon: 'sos' },
  { to: '/support', label: 'Support', icon: 'support' },
  { to: '/profile', label: 'Profile & settings', icon: 'profile' },
];

// The opened menu leads with the SOS/panic action (Section 8.3) as a direct,
// visible item — coral-tinted (`danger`), one tap, no sub-page — then the
// "Emergency contacts" reference link, then the normal destinations.
// `onSOS` runs the shared SOS flow (see sos.js); it's supplied by whichever
// shell/header is rendering the menu so the toast feedback lands in-context.
export function buildNavMenuItems({ onSOS }) {
  return [
    { label: 'Send SOS alert', icon: 'sos', danger: true, onClick: onSOS },
    ...NAV_LINKS,
  ];
}
