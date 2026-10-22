// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whether the app runs the demonstration (src/demo/server.ts answers the API in
 * the browser). Kept for the browser tab, so a reload stays in the demonstration.
 */
import { resetDemo } from './server';

const KEY = 'wattometro.demo';

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let active = read();

export const isDemo = () => active;

export function enterDemo(): void {
  active = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Not kept across a reload; the demonstration still runs now.
  }
}

export function exitDemo(): void {
  active = false;
  resetDemo();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing kept to remove.
  }
}
