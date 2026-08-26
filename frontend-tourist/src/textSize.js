// Text-size control (Batch 19) — an accessibility control alongside the
// existing physical-accessibility filter tags (Home.jsx's
// ACCESSIBILITY_FEATURES), for a different need: readability, not mobility.
//
// The whole app uses fixed px font sizes in inline styles rather than rem
// units, so a root font-size change wouldn't touch anything. CSS `zoom`
// scales the entire rendered page (text, spacing, tap targets together)
// without that retrofit — well-supported in Chromium/Safari, and in
// Firefox since 2024 (126); on an older Firefox this option is a no-op
// rather than broken, which is an acceptable degradation for a size
// preference, not a hard requirement.

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'atollisle_text_scale';

export const TEXT_SIZE_OPTIONS = [
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Extra large' },
];

function getStoredScale() {
  try {
    const value = parseFloat(localStorage.getItem(STORAGE_KEY));
    return TEXT_SIZE_OPTIONS.some((o) => o.value === value) ? value : 1;
  } catch {
    return 1;
  }
}

function applyScale(scale) {
  document.documentElement.style.zoom = scale === 1 ? '' : String(scale);
}

// Call once, before the app renders, so the stored preference is applied
// before first paint (mirrors theme.js's initTheme).
export function initTextSize() {
  applyScale(getStoredScale());
}

export function useTextSize() {
  const [scale, setScaleState] = useState(getStoredScale);

  const setScale = useCallback((value) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // localStorage unavailable — the change still applies, just won't persist.
    }
    applyScale(value);
    setScaleState(value);
  }, []);

  return { scale, setScale };
}
