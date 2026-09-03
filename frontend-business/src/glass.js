// Glass mode — a frosted-glass surface treatment, toggled independently of
// light/dark (so there are four combinations: Light/Dark × Solid/Glass).
// Sets data-glass="on" on <html>, which styles/theme.css's [data-glass]
// rules read. Persisted in localStorage the same way the theme override and
// text size are (theme.js / textSize.js) — a per-device preference, not
// synced to the account.

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'atollisle_glass'; // 'on' means glass; absent/anything else means solid (the default)

export function getGlass() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function applyGlass(on) {
  if (on) document.documentElement.setAttribute('data-glass', 'on');
  else document.documentElement.removeAttribute('data-glass');
}

// Call once, before the app renders, so the stored preference is applied
// before first paint (mirrors theme.js's initTheme / textSize.js's
// initTextSize).
export function initGlass() {
  applyGlass(getGlass());
}

// React hook for the Appearance toggle.
export function useGlass() {
  const [on, setOnState] = useState(getGlass);

  const setOn = useCallback((next) => {
    const value = Boolean(next);
    try {
      if (value) localStorage.setItem(STORAGE_KEY, 'on');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — the change still
      // applies for this session, it just won't persist.
    }
    applyGlass(value);
    setOnState(value);
  }, []);

  return { on, setOn };
}
