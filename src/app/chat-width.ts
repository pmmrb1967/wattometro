// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The chat panel's width on wide screens, dragged by its left edge (as in
 * ifanalysis) and remembered on this device. Phones always use the whole screen.
 */
const KEY = 'wattometro.chat.width';
export const CHAT_DEFAULT_WIDTH = 420;
export const CHAT_MIN_WIDTH = 320;
export const CHAT_MAX_WIDTH = 800;
/** The panel's distance from each side of the window (as in index.css). */
const MARGIN = 24;

/** Within the limits and leaving the window's margins (and some page) free. */
export function clampChatWidth(width: number, viewport: number): number {
  const max = Math.max(CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, viewport - 2 * MARGIN));
  return Math.round(Math.min(max, Math.max(CHAT_MIN_WIDTH, width)));
}

/** The width for a pointer at x: the panel's right edge stays where it is. */
export function chatWidthAt(x: number, viewport: number): number {
  return clampChatWidth(viewport - MARGIN - x, viewport);
}

export function loadChatWidth(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : CHAT_DEFAULT_WIDTH;
  } catch {
    return CHAT_DEFAULT_WIDTH;
  }
}

export function saveChatWidth(width: number): void {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // Not remembered on this device; the width still applies now.
  }
}
