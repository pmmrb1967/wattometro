// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  followsTemperature,
  installationSchema,
  UNKNOWN_INSTALLATION,
  type HeatingKind,
} from './installation';

describe('installationSchema', () => {
  it('keeps several heating kinds, in a fixed order', () => {
    const parsed = installationSchema.parse({
      ...UNKNOWN_INSTALLATION,
      heating: ['electric-heaters', 'gas-boiler'],
    });
    expect(parsed.heating).toEqual(['gas-boiler', 'electric-heaters']);
  });

  it('rejects "none" with another kind, duplicates and an empty list', () => {
    const heating = (list: string[]) =>
      installationSchema.safeParse({ ...UNKNOWN_INSTALLATION, heating: list }).success;
    expect(heating(['none', 'wood'])).toBe(false);
    expect(heating(['wood', 'wood'])).toBe(false);
    expect(heating([])).toBe(false);
    expect(heating(['solar'])).toBe(false);
    expect(heating(['none'])).toBe(true);
  });

  it('every answer may be unknown', () => {
    expect(installationSchema.parse(UNKNOWN_INSTALLATION)).toEqual(UNKNOWN_INSTALLATION);
  });
});

describe('followsTemperature', () => {
  const house = (heating: HeatingKind[] | null, ac: boolean | null) =>
    installationSchema.parse({ ...UNKNOWN_INSTALLATION, heating, airConditioning: ac });

  it('gas or wood heating and no air conditioning: no', () => {
    expect(followsTemperature(house(['gas-boiler'], false))).toBe(false);
    expect(followsTemperature(house(['wood'], false))).toBe(false);
    expect(followsTemperature(house(['none'], false))).toBe(false);
  });

  it('electric heating or air conditioning: yes', () => {
    expect(followsTemperature(house(['gas-boiler', 'electric-heaters'], false))).toBe(true);
    expect(followsTemperature(house(['heat-pump'], false))).toBe(true);
    expect(followsTemperature(house(['gas-boiler'], true))).toBe(true);
  });

  it('not known: yes, the backtest decides', () => {
    expect(followsTemperature(UNKNOWN_INSTALLATION)).toBe(true);
    expect(followsTemperature(house(['gas-boiler'], null))).toBe(true);
    expect(followsTemperature(house(null, false))).toBe(true);
  });
});
