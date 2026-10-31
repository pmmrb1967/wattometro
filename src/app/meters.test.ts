// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { shellySeriesName } from './meters';

describe('shellySeriesName', () => {
  const house = { id: 'd1', name: 'Quadro geral' };

  it('is just "Shelly" for the only one, on its first channel', () => {
    expect(shellySeriesName('d1:0', [house])).toBe('Shelly');
    expect(shellySeriesName(null, [])).toBe('Shelly');
  });

  it('names the Shelly when there are more, or on another channel', () => {
    const kitchen = { id: 'd2', name: 'Cozinha' };
    expect(shellySeriesName('d1:0', [house, kitchen])).toBe('Quadro geral (Shelly)');
    expect(shellySeriesName('d1:1', [house])).toBe('Quadro geral · canal 2 (Shelly)');
  });
});
