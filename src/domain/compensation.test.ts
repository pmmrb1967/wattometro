// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { outageCompensation } from './compensation';
import type { YearSummary } from './voltage';

/** Zone A: up to 10 long outages and 6 h a year. */
const summary = (longCount: number, longHours: number): YearSummary => ({
  year: 2025,
  longCount,
  longSeconds: longHours * 3600,
  shortCount: 0,
  excludedCount: 0,
  standard: { interruptions: 10, hours: 6 },
  overCount: longCount > 10,
  overHours: longHours > 6,
});

describe('outageCompensation (RQS art. 102.º, BTN)', () => {
  it('nothing within the standard or without a zone', () => {
    expect(outageCompensation(summary(10, 6), 6900, 3_000_000)).toBeNull();
    expect(outageCompensation({ ...summary(20, 20), standard: null }, 6900, 3_000_000)).toBeNull();
  });

  it('by number: 3 outages over × 1,20 €', () => {
    const result = outageCompensation(summary(13, 2), 6900, 3_000_000);
    expect(result).toMatchObject({ byCountCents: 360, byHoursCents: 0, cents: 360, capped: false });
  });

  it('by duration: 4 h over × 6,9 kVA × 0,45 €/kWh = 12,42 €, the higher one', () => {
    const result = outageCompensation(summary(11, 10), 6900, 3_000_000);
    expect(result).toMatchObject({ byCountCents: 120, byHoursCents: 1242, cents: 1242 });
  });

  it('capped at 200 % of the year in network tariff: 100 kWh × 0,0514 € × 2 = 10,28 €', () => {
    const result = outageCompensation(summary(11, 10), 6900, 100_000);
    expect(result).toMatchObject({ capCents: 1028, cents: 1028, capped: true, capYear: 2025 });
  });

  it('a later year uses the latest known network tariff; no energy, no cap', () => {
    const later = outageCompensation({ ...summary(11, 10), year: 2026 }, 6900, 100_000);
    expect(later).toMatchObject({ capYear: 2025, cents: 1028 });
    expect(outageCompensation(summary(11, 10), 6900, null)).toMatchObject({
      capCents: null,
      cents: 1242,
    });
  });

  it('without the contracted power only the number counts', () => {
    expect(outageCompensation(summary(12, 10), null, null)).toMatchObject({
      byHoursCents: null,
      cents: 240,
    });
  });
});
