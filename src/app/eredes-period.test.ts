// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { t } from '../i18n/pt-PT';
import { startOfLisbonDay } from '../lib/time';
import { askFor } from './eredes-period';

const texts = t.eredes.period;

describe('askFor', () => {
  it('asks for a year when nothing is imported', () => {
    expect(askFor(null, '2026-10-29')).toBe(texts.first);
  });

  it('asks from the first day not imported', () => {
    // The last quarter hour stored ends at midnight of 22/10: ask from 22/10.
    expect(askFor(startOfLisbonDay('2026-10-22'), '2026-10-29')).toBe(texts.next('22/10/2026'));
    // A day that ended at 13:00: that day again.
    expect(askFor(startOfLisbonDay('2026-10-22') + 13 * 3600, '2026-10-29')).toBe(
      texts.next('22/10/2026'),
    );
  });

  it('asks for nothing when yesterday is in', () => {
    expect(askFor(startOfLisbonDay('2026-10-29'), '2026-10-29')).toBe(texts.upToDate);
  });
});
