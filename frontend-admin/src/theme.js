// Dark mode support — resolves and applies the active theme by setting
// data-theme on <html>, which theme.css's [data-theme] rules read (see
// that file's header comment for how it interacts with the
// prefers-color-scheme media query). System preference is respected by
// default; a stored override (set from the Profile page's Appearance
// toggle) takes precedence for as long as it's set.

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'atollisle_theme'; // 'light' | 'dark' in localStorage — absent means "follow system"

export function getThemeOverride() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(override) {
  return override || (systemPrefersDark() ? 'dark' : 'light');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Call once, before the app renders, so the correct theme is set before
// first paint. Also keeps the resolved theme in sync with live
// system-preference changes for as long as no override is stored.
export function initTheme() {
  applyTheme(resolveTheme(getThemeOverride()));

  if (!window.matchMedia) return;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = () => {
    if (!getThemeOverride()) applyTheme(resolveTheme(null));
  };
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleSystemChange);
  else mediaQuery.addListener(handleSystemChange); // older Safari
}

// React hook for the Appearance toggle: `override` is 'light' | 'dark' |
// null (null = following system). setOverride(null) reverts to system.
export function useTheme() {
  const [override, setOverrideState] = useState(getThemeOverride);

  const setOverride = useCallback((theme) => {
    try {
      if (theme) localStorage.setItem(STORAGE_KEY, theme);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — theme just won't persist.
    }
    applyTheme(resolveTheme(theme));
    setOverrideState(theme);
  }, []);

  return { override, setOverride };
}
