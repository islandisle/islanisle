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

// The Socisle (Go Social) version of the menu — shown when the app is in
// the Go Social context (home-menu-pricing brief item 6). Every Go Social
// screen that exists: the feed (with the Shots strip on top), friends +
// friend requests, direct messages, and the user's own social profile.
// `/social/u/:id` and `/social/post/:id` are reached from within those, not
// listed here.
export const SOCIAL_LINKS = [
  { to: '/social', end: true, label: 'Feed & Shots', icon: 'social' },
  { to: '/social/friends', label: 'Friends & requests', icon: 'guests' },
  { to: '/messages?tab=social', label: 'Messages', icon: 'messages' },
  { to: '/social/me', label: 'My profile', icon: 'profile' },
];

// The opened menu leads with the SOS/panic action (Section 8.3) as a direct,
// visible item — coral-tinted (`danger`), one tap, no sub-page — kept in
// both menu modes since it's a safety feature — then the destinations for
// whichever mode is active (`social`). `onSOS` runs the shared SOS flow
// (see sos.js); it's supplied by whichever shell/header is rendering the
// menu so the toast feedback lands in-context.
export function buildNavMenuItems({ onSOS, social = false }) {
  return [
    { label: 'Send SOS alert', icon: 'sos', danger: true, onClick: onSOS },
    ...(social ? SOCIAL_LINKS : NAV_LINKS),
  ];
}
