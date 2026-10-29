// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parsePvgis, solarEffect, solarSaving } from './solar';
import type { TariffInput } from './tariff';

// Above 6,9 kVA, simple, no fixed term nor taxes: every kWh at 0,20 € + 23 % VAT.
const simple: TariffInput = {
  validFrom: '2026-01-01',
  supplier: null,
  powerVa: 10_350,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 0,
  energy: { simple: 200_000 },
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

/** A PVGIS year of 2023: 1000 W at 12:10 UTC every day, nothing else. */
function pvgisYear() {
  const hourly = [];
  for (let ts = Date.UTC(2023, 0, 1); ts < Date.UTC(2024, 0, 1); ts += 3_600_000) {
    const date = new Date(ts).toISOString();
    const time = `${date.slice(0, 4)}${date.slice(5, 7)}${date.slice(8, 10)}:${date.slice(11, 13)}10`;
    hourly.push({ time, P: date.slice(11, 13) === '12' ? 1000.4 : 0, 'G(i)': 0, H_sun: 0 });
  }
  return { inputs: {}, outputs: { hourly }, meta: {} };
}

// January 2026 (31 days, Lisbon is UTC): 100 Wh every quarter hour.
const START = Date.UTC(2026, 0, 1) / 1000;
const quarters = Array.from({ length: 31 * 96 }, (_, i) => ({
  ts: START + i * 900,
  energyWh: 100,
}));

describe('parsePvgis', () => {
  it('keys each hour by UTC month, day and hour, in whole Wh', () => {
    const year = parsePvgis(pvgisYear());
    expect(year?.size).toBe(8760);
    expect(year?.get('010112')).toBe(1000);
    expect(year?.get('010113')).toBe(0);
  });

  it('refuses what is not a year of hours', () => {
    expect(parsePvgis({ outputs: { hourly: [] } })).toBeNull();
    expect(parsePvgis({ error: 'x' })).toBeNull();
  });
});

describe('solarEffect', () => {
  it('uses what is produced up to the consumption, the rest is surplus', () => {
    const year = parsePvgis(pvgisYear());
    // 2 kWp: 500 Wh in each quarter of the 12:00 UTC hour; the house uses 100 of them.
    // A day: 2000 Wh produced, 400 used, 1600 surplus; × 365 for the year.
    const effect = solarEffect(quarters, year ?? new Map(), 20, 'pre-2027');
    expect(effect).toMatchObject({
      productionWh: 730_000,
      selfWh: 146_000,
      surplusWh: 584_000,
    });
    expect(effect?.usage.totalWh).toBe(3_504_000 - 146_000);
  });

  it('matches 29 February to the 28th', () => {
    const year = new Map([['022812', 1000]]);
    const leap = Date.UTC(2028, 1, 29, 12) / 1000;
    const effect = solarEffect(
      Array.from({ length: 30 * 96 }, (_, i) => ({ ts: leap + i * 900, energyWh: 100 })),
      year,
      10,
      'pre-2027',
    );
    // Only the first hour (29/2, 12:00 UTC) produces: 4 quarters of 250 Wh, 100 used each.
    expect(effect?.selfWh).toBe(Math.round((400 * 365 * 96) / (30 * 96)));
  });
});

describe('solarEffect with a battery', () => {
  const year = () => parsePvgis(pvgisYear()) ?? new Map<string, number>();

  it('keeps surplus for later, losing the round trip on the way in', () => {
    // 1 kWh at 90 %, 2 kWp. Each noon hour leaves 400 Wh a quarter: 400 in (360 kept),
    // 400 in (720), 311 in (999), 1 in (999); after 13:00 the house takes the 999 Wh back.
    // A day: 400 + 999 used, 1600 − 1112 = 488 Wh of surplus.
    const effect = solarEffect(quarters, year(), 20, 'pre-2027', {
      tenthsKwh: 10,
      efficiencyPct: 90,
      tenthsKw: null,
    });
    expect(effect).toMatchObject({
      productionWh: 730_000,
      selfWh: 1399 * 365,
      surplusWh: 488 * 365,
      batteryWh: 999 * 365,
    });
    expect(effect?.usage.totalWh).toBe(3_504_000 - 1399 * 365);
  });

  it('charges no faster than its power', () => {
    // 0,5 kW: 125 Wh a quarter, 4 × 125 in → 4 × 112 kept = 448 Wh a day.
    const effect = solarEffect(quarters, year(), 20, 'pre-2027', {
      tenthsKwh: 10,
      efficiencyPct: 90,
      tenthsKw: 5,
    });
    expect(effect?.batteryWh).toBe(448 * 365);
    expect(effect?.surplusWh).toBe(1100 * 365);
  });

  it('gives nothing without a battery', () => {
    expect(solarEffect(quarters, year(), 20, 'pre-2027')?.batteryWh).toBe(0);
  });
});

describe('solarSaving', () => {
  it('prices what comes off the bill, the surplus and the payback', () => {
    const saving = solarSaving({
      quarters,
      year: parsePvgis(pvgisYear()) ?? new Map(),
      tenthsKwp: 20,
      current: simple,
      offers: [],
      today: '2026-10-29',
      surplusMicro: 50_000,
      installCents: 300_000,
    });
    // 3504 kWh → 3358 kWh at 0,20 € + 23 %: 861,98 € → 826,07 €.
    expect(saving?.savingCents).toBe(86_198 - 82_607);
    expect(saving?.currentWithSolarCents).toBe(82_607);
    // 584 kWh of surplus at 0,05 €: 29,20 €.
    expect(saving?.surplusCents).toBe(2_920);
    // 3000 € / (35,91 € + 29,20 €) a year: 46,1 years.
    expect(saving?.paybackYears).toBe(46.1);
    expect(saving?.best).toBeNull();
  });

  it('leaves the surplus and the payback out without their figures', () => {
    const saving = solarSaving({
      quarters,
      year: parsePvgis(pvgisYear()) ?? new Map(),
      tenthsKwp: 20,
      current: simple,
      offers: [],
      today: '2026-10-29',
      surplusMicro: null,
      installCents: null,
    });
    expect(saving?.surplusCents).toBeNull();
    expect(saving?.paybackYears).toBeNull();
  });

  it('prices what the battery adds to the panels, less the surplus no longer sold', () => {
    const saving = solarSaving({
      quarters,
      year: parsePvgis(pvgisYear()) ?? new Map(),
      tenthsKwp: 20,
      current: simple,
      offers: [],
      today: '2026-10-29',
      surplusMicro: 50_000,
      installCents: null,
      battery: { tenthsKwh: 10, efficiencyPct: 90, tenthsKw: null },
      batteryCents: 500_000,
    });
    // The panels alone are unchanged.
    expect(saving?.savingCents).toBe(86_198 - 82_607);
    // 3504 kWh − 510,635 kWh = 2993,365 kWh at 0,246 €: 736,37 €.
    expect(saving?.currentWithSolarCents).toBe(73_637);
    expect(saving?.battery).toMatchObject({
      batteryWh: 364_635,
      savingCents: 82_607 - 73_637,
      // 178,12 kWh at 0,05 €: 8,91 €, 20,29 € less sold than without the battery.
      surplusCents: 891,
      // 5000 € / (89,70 € − 20,29 €) a year: 72 years.
      paybackYears: 72,
    });
  });
});
