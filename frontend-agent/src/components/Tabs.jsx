import { useState } from 'react';

// A single-page dashboard that stacks every section (listings, bookings,
// check-in, returns, reviews, nudges...) in one long scroll is hard to
// manage day-to-day — you have to scroll past sections you don't need to
// reach the one you do. Tabs group the same content (nothing removed,
// nothing re-plumbed) into focused views, with an optional badge so a tab
// can flag "something needs attention" without opening it first.
//
// Usually self-contained (tracks its own active tab, remembers the last
// one via storageKey). Pass `value`/`onChange` instead when something
// outside the tab strip needs to jump to a specific tab (e.g. a "today"
// digest linking straight into "Approvals").
export default function Tabs({ tabs, initial, storageKey, value, onChange }) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(() => {
    if (storageKey) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved && tabs.some((t) => t.id === saved)) return saved;
    }
    return initial || tabs[0]?.id;
  });

  const active = controlled ? value : internal;

  function select(id) {
    if (controlled) {
      onChange?.(id);
    } else {
      setInternal(id);
      if (storageKey) sessionStorage.setItem(storageKey, id);
    }
  }

  const current = tabs.find((t) => t.id === active) || tabs[0];

  return (
    <div>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => select(t.id)}
              style={{
                position: 'relative',
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 'var(--radius-pill) var(--radius-pill) 0 0',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--lagoon)' : '2px solid transparent',
                background: 'transparent',
                color: isActive ? 'var(--lagoon)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t.label}
              {t.badge ? (
                <span
                  style={{
                    marginLeft: 6,
                    display: 'inline-block',
                    minWidth: 16,
                    padding: '0 4px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--coral)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '16px',
                  }}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
