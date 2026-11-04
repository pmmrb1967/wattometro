// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Every button has one of the app's looks (index.css: .primary, .secondary,
 * .link-button, …, or the group it sits in, such as .segmented): without one,
 * the browser draws its own grey button, 21 px tall, too small to tap.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'src';

/** Groups whose buttons index.css styles through the group (`.segmented button`). */
const STYLED_GROUPS = ['segmented'];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

/** `file:line` of each <button> with no className and not inside a styled group. */
function unstyledButtons(): string[] {
  return sources(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/<button\b((?:=>|[^>])*)>/g)].flatMap((match) => {
      if (match[1]?.includes('className')) return [];
      const before = text.slice(Math.max(0, (match.index ?? 0) - 400), match.index);
      if (STYLED_GROUPS.some((group) => before.includes(`className="${group}"`))) return [];
      return [`${file}:${text.slice(0, match.index).split('\n').length}`];
    });
  });
}

describe('buttons', () => {
  it('all have one of the app’s looks', () => {
    expect(unstyledButtons()).toEqual([]);
  });
});
