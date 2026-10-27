// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  formatPricePerKwh,
  omieToMicro,
  bpToPtInput,
  centsToPtInput,
  divideRounded,
  eurosToMicro,
  formatCents,
  formatWholeEuros,
  microToPtInput,
  nanoToCents,
  parseDotDecimalAmount,
  parsePtAmount,
  parsePtPercent,
  parsePtPrice,
  sumCents,
  wholeEurosUp,
} from './money';

describe('parsePtAmount', () => {
  it.each([
    ['12,34', 1234],
    ['12,3', 1230],
    ['12', 1200],
    ['0,07', 7],
    ['1.234,56', 123456],
    ['1 234,56 €', 123456],
    ['1\u00a0234,56\u00a0€', 123456],
    ['-5,10', -510],
    ['€ 9,99', 999],
  ])('parses %j as %i cents', (text, cents) => {
    expect(parsePtAmount(text)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '1.23', '1,2,3'])('rejects %j', (text) => {
    expect(parsePtAmount(text)).toBeNull();
  });

  it('avoids floating point drift', () => {
    expect(parsePtAmount('0,29')).toBe(29);
    expect(parsePtAmount('1,15')).toBe(115);
  });
});

describe('parseDotDecimalAmount', () => {
  it.each([
    ['1234.56', 123456],
    ['0.10', 10],
    ['7', 700],
    ['-3.5', -350],
  ])('parses %j as %i cents', (text, cents) => {
    expect(parseDotDecimalAmount(text)).toBe(cents);
  });

  it.each(['1,23', '1.234,56', '1.234'])('rejects %j', (text) => {
    expect(parseDotDecimalAmount(text)).toBeNull();
  });
});

describe('sumCents', () => {
  it('sums integer cents', () => {
    expect(sumCents([10, 20, -5])).toBe(25);
  });

  it('rejects non-integer values', () => {
    expect(() => sumCents([0.1])).toThrow(TypeError);
  });
});

describe('formatCents', () => {
  it('formats in pt-PT euros', () => {
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('1234,56 €');
  });
});

describe('wholeEurosUp', () => {
  it('rounds up to whole euros', () => {
    expect(wholeEurosUp(3990)).toBe(40);
    expect(wholeEurosUp(4000)).toBe(40);
    expect(wholeEurosUp(4001)).toBe(41);
  });
});

describe('centsToPtInput', () => {
  it('writes cents with a comma and two decimals', () => {
    expect(centsToPtInput(3999)).toBe('39,99');
    expect(centsToPtInput(5)).toBe('0,05');
    expect(centsToPtInput(-1200)).toBe('-12,00');
    expect(parsePtAmount(centsToPtInput(123456))).toBe(123456);
  });
});

describe('unit prices in micro-euros', () => {
  it('parses prices as printed on invoices and offers', () => {
    expect(parsePtPrice('0,1665')).toBe(166_500);
    expect(parsePtPrice('0.166543')).toBe(166_543);
    expect(parsePtPrice('0,5636 €')).toBe(563_600);
    expect(parsePtPrice('1')).toBe(1_000_000);
    expect(parsePtPrice('0,1234567')).toBeNull();
    expect(parsePtPrice('-0,1')).toBeNull();
    expect(parsePtPrice('abc')).toBeNull();
  });

  it('converts and formats without losing digits', () => {
    expect(eurosToMicro(0.261579822840437)).toBe(261_580);
    expect(microToPtInput(166_500)).toBe('0,1665');
    expect(microToPtInput(1_000_000)).toBe('1,00');
    expect(microToPtInput(166_543)).toBe('0,166543');
  });

  it('rounds exactly, half up', () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(4n, 3n)).toBe(1n);
    // 2,5 kWh × 0,1665 €/kWh = 0,41625 € → 42 cents.
    expect(nanoToCents(2500n * 166_500n)).toBe(42);
  });
});

describe('parsePtPercent / bpToPtInput', () => {
  it('reads percentages with up to 2 decimals', () => {
    expect(parsePtPercent('4')).toBe(400);
    expect(parsePtPercent('4,5 %')).toBe(450);
    expect(parsePtPercent('0.25')).toBe(25);
    expect(parsePtPercent('100')).toBe(10_000);
    expect(parsePtPercent('100,01')).toBeNull();
    expect(parsePtPercent('-1')).toBeNull();
    expect(parsePtPercent('4,555')).toBeNull();
  });

  it('writes them back without trailing zeros', () => {
    expect(bpToPtInput(400)).toBe('4');
    expect(bpToPtInput(450)).toBe('4,5');
    expect(bpToPtInput(25)).toBe('0,25');
  });
});

describe('formatWholeEuros', () => {
  it('rounds to whole euros for estimates', () => {
    expect(formatWholeEuros(6249)).toBe('62 €');
    expect(formatWholeEuros(6250)).toBe('63 €');
    expect(formatWholeEuros(0)).toBe('0 €');
    expect(() => formatWholeEuros(1.5)).toThrow(TypeError);
  });
});

describe('OMIE prices', () => {
  it('cents per MWh to micro-euros per kWh, and shown per kWh', () => {
    expect(omieToMicro(9540)).toBe(95_400); // 95,40 €/MWh = 0,0954 €/kWh
    expect(formatPricePerKwh(95_400)).toBe('0,095\u00a0€/kWh');
    expect(formatPricePerKwh(omieToMicro(-1000))).toBe('-0,010\u00a0€/kWh');
  });
});
