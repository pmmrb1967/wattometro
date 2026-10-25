// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { KEEP_DAYS, keysToDrop } from './seconds-cache';

it('keeps the latest days of each meter', () => {
  const days = Array.from(
    { length: KEEP_DAYS + 2 },
    (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`,
  );
  const keys = [
    ...days.map((day) => `h|d1:0|${day}`),
    ...days.slice(0, 3).map((day) => `h|d2:0|${day}`),
  ];
  expect(keysToDrop(keys)).toEqual(['h|d1:0|2026-10-01', 'h|d1:0|2026-10-02']);
});
