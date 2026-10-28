// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Light, dark or as the device: `data-theme` on <html> (index.css), kept in
 * this browser only. Storage can be missing (private mode): automatic then.
 */
export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const KEY = 'wm-theme';

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.find((theme) => theme === value) ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Not kept; it still applies until the page closes.
  }
}
