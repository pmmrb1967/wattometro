// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { checkInstall, STALE_SECONDS } from './install-check';
import { VOLTAGE_LIMITS } from './voltage';

const NOW = 1_793_000_000;
const minute = (powerAvgW: number, voltageAvgDv = 2300) => ({
  now: NOW,
  lastSeenAt: NOW - 30,
  latest: { ts: NOW - 60, powerAvgW, voltageAvgDv },
});

describe('checkInstall', () => {
  it('says only that it never sent, or stopped sending', () => {
    expect(checkInstall({ now: NOW, lastSeenAt: null, latest: null }, VOLTAGE_LIMITS)).toEqual([
      { id: 'sending', state: 'fail', finding: 'never' },
    ]);
    const old = { ...minute(300), lastSeenAt: NOW - STALE_SECONDS - 1 };
    expect(checkInstall(old, VOLTAGE_LIMITS)).toEqual([
      { id: 'sending', state: 'fail', finding: 'stale' },
    ]);
  });

  it('passes a house drawing 300 W at 230 V', () => {
    expect(checkInstall(minute(300), VOLTAGE_LIMITS).map((check) => check.state)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
  });

  it('finds the clamp the wrong way round', () => {
    expect(checkInstall(minute(-300), VOLTAGE_LIMITS)).toContainEqual({
      id: 'direction',
      state: 'fail',
      finding: 'reversed',
    });
  });

  it('warns when the clamp sees about nothing', () => {
    expect(checkInstall(minute(3), VOLTAGE_LIMITS)).toContainEqual({
      id: 'clamp',
      state: 'warn',
      finding: 'idle',
    });
    expect(checkInstall(minute(-8), VOLTAGE_LIMITS)).toContainEqual({
      id: 'clamp',
      state: 'warn',
      finding: 'idle',
    });
  });

  it('warns about a voltage outside the limits', () => {
    expect(checkInstall(minute(300, 2000), VOLTAGE_LIMITS)).toContainEqual({
      id: 'voltage',
      state: 'warn',
      finding: 'low',
    });
    expect(checkInstall(minute(300, 2600), VOLTAGE_LIMITS)).toContainEqual({
      id: 'voltage',
      state: 'warn',
      finding: 'high',
    });
  });
});
