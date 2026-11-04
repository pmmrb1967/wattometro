// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  parsePrintedLabelEnergy,
  parsePrintedEnergyWh,
  parsePrintedPowerW,
  formatKwhField,
  parseKwhToWh,
  formatCelsius,
  formatKva,
  parsePtTenths,
  formatKwh,
  formatPower,
  formatVolts,
  roundedKwh,
  sumWh,
  toTenthsCelsius,
} from './units';

// Intl in pt-PT uses a no-break space as thousands separator.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('sumWh', () => {
  it('adds integer Wh', () => {
    expect(sumWh([100, 250, 1])).toBe(351);
    expect(sumWh([])).toBe(0);
  });

  it('rejects fractional values', () => {
    expect(() => sumWh([1, 0.5])).toThrow(TypeError);
  });
});

describe('roundedKwh', () => {
  it.each([
    [0, 0],
    [1499, 1],
    [1500, 2],
    [12_345, 12],
  ])('%i Wh → %i kWh', (wh, kwh) => {
    expect(roundedKwh(wh)).toBe(kwh);
  });
});

describe('formatting', () => {
  it('formats energy in kWh', () => {
    expect(formatKwh(12_345)).toBe('12,3\u00a0kWh');
    expect(formatKwh(500, 2)).toBe('0,50\u00a0kWh');
    // pt-PT only groups thousands from five digits on.
    expect(formatKwh(1_234_500)).toBe('1234,5\u00a0kWh');
    expect(plain(formatKwh(12_345_600))).toBe('12 345,6 kWh');
  });

  it('formats power in W or kW', () => {
    expect(formatPower(850)).toBe('850\u00a0W');
    expect(formatPower(3450)).toBe('3,45\u00a0kW');
    expect(formatPower(6900)).toBe('6,90\u00a0kW');
  });

  it('formats voltage from decivolts', () => {
    expect(formatVolts(2305)).toBe('230,5\u00a0V');
    expect(formatVolts(2530)).toBe('253,0\u00a0V');
  });

  it('rejects non-integer input', () => {
    expect(() => formatKwh(1.5)).toThrow(TypeError);
    expect(() => formatPower(0.1)).toThrow(TypeError);
    expect(() => formatVolts(230.5)).toThrow(TypeError);
  });
});

describe('formatKva', () => {
  it('shows the ERSE tiers as on invoices', () => {
    expect(formatKva(6900)).toBe('6,9\u00a0kVA');
    expect(formatKva(10350)).toBe('10,35\u00a0kVA');
    expect(formatKva(41400)).toBe('41,4\u00a0kVA');
  });
});

describe('temperature', () => {
  it('keeps tenths of a degree as integers', () => {
    expect(toTenthsCelsius(12.3)).toBe(123);
    expect(toTenthsCelsius(-0.4)).toBe(-4);
    expect(toTenthsCelsius(18.05)).toBe(181);
    expect(formatCelsius(123)).toBe('12,3\u00a0°C');
    expect(formatCelsius(-4)).toBe('-0,4\u00a0°C');
    expect(formatCelsius(155, 0)).toBe('16\u00a0°C');
    expect(() => formatCelsius(1.5)).toThrow(TypeError);
  });
});

describe('parsePtTenths', () => {
  it('reads one decimal, with a comma or a dot', () => {
    expect(parsePtTenths('16,5')).toBe(165);
    expect(parsePtTenths(' 16.5 ')).toBe(165);
    expect(parsePtTenths('16')).toBe(160);
    expect(parsePtTenths('7,4')).toBe(74);
  });

  it('refuses the rest', () => {
    expect(parsePtTenths('')).toBeNull();
    expect(parsePtTenths('16,55')).toBeNull();
    expect(parsePtTenths('-3')).toBeNull();
    expect(parsePtTenths('abc')).toBeNull();
  });
});

describe('parseKwhToWh', () => {
  it('reads kWh as the manual writes them, to whole Wh', () => {
    expect(parseKwhToWh('0,458')).toBe(458);
    expect(parseKwhToWh(' 1.011 ')).toBe(1011);
    expect(parseKwhToWh('2')).toBe(2000);
    expect(parseKwhToWh('0,5')).toBe(500);
  });

  it('refuses what is not a kWh with three decimals at most', () => {
    expect(parseKwhToWh('')).toBeNull();
    expect(parseKwhToWh('0,4581')).toBeNull();
    expect(parseKwhToWh('-1')).toBeNull();
    expect(parseKwhToWh('abc')).toBeNull();
  });

  it('writes Wh back for the field', () => {
    expect(formatKwhField(458)).toBe('0,458');
    expect(formatKwhField(2000)).toBe('2,000');
  });
});

describe('values printed on a plate or a manual', () => {
  it('reads a power in W or kW; a range gives its top', () => {
    expect(parsePrintedPowerW('2100 W')).toBe(2100);
    expect(parsePrintedPowerW('2,1 kW')).toBe(2100);
    expect(parsePrintedPowerW('2.2kW')).toBe(2200);
    expect(parsePrintedPowerW('1850-2200W')).toBe(2200);
    expect(parsePrintedPowerW('1 850 W')).toBe(1850);
    expect(parsePrintedPowerW('1 850 W')).toBe(1850);
    expect(parsePrintedPowerW('220-240 V')).toBeNull();
    // A degree of protection or a voltage before it is not part of the number.
    expect(parsePrintedPowerW('IPX4 230 W')).toBe(230);
    expect(parsePrintedPowerW('230V~ 50Hz 2000W')).toBe(2000);
    expect(parsePrintedPowerW('2000 Watts')).toBe(2000);
    expect(parsePrintedPowerW('1850 W - 2200 W')).toBe(2200);
    expect(parsePrintedPowerW('potente')).toBeNull();
  });

  it('reads an energy in kWh or Wh; without a unit, kWh', () => {
    expect(parsePrintedEnergyWh('0,46 kWh')).toBe(460);
    expect(parsePrintedEnergyWh('458 Wh')).toBe(458);
    expect(parsePrintedEnergyWh('1,011 kWh/ciclo')).toBe(1011);
    expect(parsePrintedEnergyWh('0.95')).toBe(950);
    expect(parsePrintedEnergyWh('-')).toBeNull();
  });

  it('refuses an energy per 100 cycles, per year or per 1000 h: not one cycle', () => {
    expect(parsePrintedEnergyWh('0,95 kWh/100 ciclos')).toBeNull();
    expect(parsePrintedEnergyWh('15 kWh / 100')).toBeNull();
    expect(parsePrintedEnergyWh('152 kWh/ano')).toBeNull();
    expect(parsePrintedEnergyWh('1,011 kWh/ciclo')).toBe(1011);
  });
});

describe('parsePrintedLabelEnergy', () => {
  it('reads the energy label in its own unit', () => {
    expect(parsePrintedLabelEnergy('250 kWh/annum')).toEqual({ basis: 'year', labelWh: 250_000 });
    expect(parsePrintedLabelEnergy('152 kWh/ano')).toEqual({ basis: 'year', labelWh: 152_000 });
    expect(parsePrintedLabelEnergy('58 kWh/100 ciclos')).toEqual({
      basis: 'cycles100',
      labelWh: 58_000,
    });
    expect(parsePrintedLabelEnergy('0,95 kWh / 100')).toEqual({ basis: 'cycles100', labelWh: 950 });
    expect(parsePrintedLabelEnergy('70 kWh/1000h')).toEqual({
      basis: 'hours1000',
      labelWh: 70_000,
    });
  });

  it('gives null for an energy without the label’s unit', () => {
    expect(parsePrintedLabelEnergy('0,46 kWh')).toBeNull();
    expect(parsePrintedLabelEnergy('A')).toBeNull();
  });
});
