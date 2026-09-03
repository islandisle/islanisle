import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useModalA11y } from '../useModalA11y';

// Batch 27 — the single hamburger menu that replaced each app's scattered
// row of top-bar buttons / links. Same interaction across all four
// frontends: a ☰ button opens a right-side slide-out sheet of
// destinations, each a labelled item with a line icon. Reuses the shared
// modal focus-trap (Escape closes, focus returns to the ☰ button, Tab
// cycles inside). Contents are passed in per app.
//
// items: [{ to?, label, icon, onClick?, danger? }]
//   - `to`      renders a NavLink with an active-route highlight
//   - `onClick` renders a plain button (e.g. log out)
//   - `icon`    is a key into the Icon component below
//   - `danger`  tints the item with the coral accent (log out / destructive)

const ICON_PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  bookings: <><rect x="4" y="4" width="16" height="17" rx="1.5" /><path d="M8 2.5v3M16 2.5v3M4 9.5h16M9 14h6" /></>,
  trips: <><path d="M4 20 12 4l8 16" /><path d="M8.5 12h7" /><circle cx="12" cy="4" r="1" /></>,
  favorites: <path d="M12 20s-7-4.35-9.2-8.5C1.3 8.7 3 5.5 6.2 5.5c1.9 0 3.1 1 3.8 2 .7-1 1.9-2 3.8-2 3.2 0 4.9 3.2 3.4 6-2.2 4.15-9 8.5-9 8.5Z" />,
  messages: <path d="M4 5h16v11H9l-4 3.5V16H4z" />,
  guide: <><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2z" /><path d="M18 20V4l1.2.6V20z" /><path d="M9 8h5M9 11h5" /></>,
  sos: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v5M12 16.2v.2" /></>,
  support: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8M12 16.2v.2" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5" /></>,
  transfers: <><path d="M3 15h15l3 3M3 15l2-4h9l3 4M6.5 18.5v1M15 18.5v1" /><circle cx="8" cy="15" r="0.5" /></>,
  logout: <><path d="M9 4H5v16h4" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></>,
  analytics: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  payouts: <><rect x="3" y="6" width="18" height="12" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v6M18 9v6" /></>,
  b2b: <><circle cx="7" cy="9" r="2.5" /><circle cx="17" cy="9" r="2.5" /><path d="M9.5 9h5M3 19c0-2.5 2-4 4-4s4 1.5 4 4M13 19c0-2.5 2-4 4-4s4 1.5 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  queue: <><path d="M4 6h16M4 12h16M4 18h10" /><circle cx="19" cy="18" r="1.5" /></>,
  guests: <><circle cx="9" cy="8" r="3" /><path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 14c2.5 0 4 1.7 4 4" /><circle cx="17" cy="8.5" r="2.5" /></>,
};

function Icon({ name }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      {ICON_PATHS[name] || ICON_PATHS.home}
    </svg>
  );
}

export default function NavMenu({ items, label = 'Menu', buttonStyle }) {
  const [open, setOpen] = useState(false);
  const sheetRef = useModalA11y(() => setOpen(false));

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 'var(--radius-sm, 8px)',
          border: 'none', background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
          color: 'currentColor', ...buttonStyle,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open && createPortal((
        <div
          className="glass-scrim"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(11, 46, 61, 0.55)',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <nav
            ref={sheetRef}
            aria-label={label}
            className="glass-surface"
            onClick={(e) => e.stopPropagation()}
            style={{
              /* 100vh, not 100%: backdrop-filter (glass mode) makes a flex child's height:100% collapse. */
              width: 'min(84vw, 300px)', height: '100vh',
              background: 'var(--surface)', borderLeft: '1px solid var(--border)',
              padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 2,
              animation: 'nav-slide-in 0.18s ease-out',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px 10px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {label}
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            {items.map((item) => {
              const tint = item.danger ? 'var(--coral)' : 'var(--navy)';
              const row = {
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 8px', borderRadius: 'var(--radius-sm, 8px)',
                fontSize: 14, color: tint, textDecoration: 'none',
                border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer',
              };
              if (item.onClick) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => { setOpen(false); item.onClick(); }}
                    style={row}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  style={({ isActive }) => ({
                    ...row,
                    background: isActive ? 'var(--lagoon-tint)' : 'none',
                    fontWeight: isActive ? 600 : 400,
                  })}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      ), document.body)}
    </>
  );
}
