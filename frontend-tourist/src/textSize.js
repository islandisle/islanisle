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
//
// The control is a horizontal slider (Profile > Settings). The stops run
// from a step below the old "Default" (1.0) up to the old "Extra large"
// (1.3) — the ceiling is unchanged, the floor is new, for readers who
// want more on screen at once rather than less.

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'atollisle_text_scale';

export const TEXT_SIZE_MIN = 0.9;
export const TEXT_SIZE_MAX = 1.3;
export const TEXT_SIZE_STEP = 0.05;
export const TEXT_SIZE_DEFAULT = 1;

function clampScale(value) {
  if (!Number.isFinite(value)) return TEXT_SIZE_DEFAULT;
  if (value < TEXT_SIZE_MIN) return TEXT_SIZE_MIN;
  if (value > TEXT_SIZE_MAX) return TEXT_SIZE_MAX;
  // Snap to the nearest step so a stored value always lands on a slider stop.
  const steps = Math.round((value - TEXT_SIZE_MIN) / TEXT_SIZE_STEP);
  return Number((TEXT_SIZE_MIN + steps * TEXT_SIZE_STEP).toFixed(2));
}

function getStoredScale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return TEXT_SIZE_DEFAULT;
    return clampScale(parseFloat(raw));
  } catch {
    return TEXT_SIZE_DEFAULT;
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
    const next = clampScale(typeof value === 'number' ? value : parseFloat(value));
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage unavailable — the change still applies, just won't persist.
    }
    applyScale(next);
    setScaleState(next);
  }, []);

  return { scale, setScale };
}
