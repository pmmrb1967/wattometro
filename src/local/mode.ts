// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whether the app runs the local mode (src/local/server.ts answers the API in
 * the browser). Kept in this browser, so opening the app again goes straight
 * back to it; leaving it keeps the data (only "Apagar" removes them).
 */
const KEY = 'wattometro.local';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let active = read();

export const isLocal = () => active;

export function enterLocal(): void {
  active = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Not kept for the next visit; the local mode still runs now.
  }
  // Asks the browser not to clear the data when space runs short; it may say no.
  void navigator.storage?.persist?.().catch(() => false);
}

export function exitLocal(): void {
  active = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept to remove.
  }
}
