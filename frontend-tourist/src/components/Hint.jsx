import { useState } from 'react';

// Batch 19: contextual first-use tooltips. Distinct from FirstRunTour (a
// one-time full-screen walkthrough shown right after signup) — a Hint
// appears the first time a user actually reaches a specific feature,
// however long after signup that is, and never again once dismissed.
// Each `id` is tracked independently in localStorage so dismissing one
// hint doesn't affect the others.
const STORAGE_KEY = 'atollisle_hints_dismissed';

function readDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markDismissed(id) {
  try {
    const dismissed = readDismissed();
    if (!dismissed.includes(id)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed, id]));
    }
  } catch {
    // ignore — worst case the hint reappears next visit, not harmful
  }
}

export default function Hint({ id, text }) {
  const [dismissed, setDismissed] = useState(() => readDismissed().includes(id));

  if (dismissed) return null;

  return (
    <div
      role="note"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: 'var(--lagoon-tint)', border: '1px solid var(--lagoon-light)',
        borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--navy)', flex: 1 }}>{text}</span>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => { markDismissed(id); setDismissed(true); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
          color: 'var(--text-muted)', lineHeight: 1, padding: 2,
        }}
      >
        ✕
      </button>
    </div>
  );
}
