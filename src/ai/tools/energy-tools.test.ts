// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { daySlots } from '../../app/compare-series';
import { baseloadCost, nightlyBaseload, recentBaseload } from '../../domain/baseload';
import { annualUsage, compareOffers } from '../../domain/compare';
import { addDays } from '../../domain/consumption';
import type { Offer } from '../../domain/erse';
import { monthlyReport } from '../../domain/monthly-report';
import type { Tariff } from '../../domain/tariff';
import { formatCents } from '../../lib/money';
import { lisbonParts, startOfLisbonDay } from '../../lib/time';
import { formatPower } from '../../lib/units';
import { recentAnomalies } from '../../ml/anomalies';
import { currentMonthForecast } from '../../ml/month-forecast';
import { ENERGY_TOOLS } from './energy-tools';
import { inputSchema, runTool, type ToolContext } from './tool';

const TODAY = '2026-10-25';

const tariff: Tariff = {
  id: 't1',
  validFrom: '2025-01-01',
  supplier: 'Atual',
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 300_000,
  energy: { simple: 160_000 },
  iecPerKwh: 1_000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

function offer(id: string, prices: Offer['prices'][string]): Offer {
  return {
    id,
    supplier: `Comercializador ${id}`,
    name: `Oferta ${id}`,
    segment: 'Dom',
    supply: 'ELE',
    durationMonths: null,
    validFrom: null,
    validTo: null,
    loyalty: id === 'B',
    indexedPrices: false,
    renewable: false,
    restrictions: false,
    requiredServices: false,
    servicesPerYearWithVat: 0,
    discounts: { fixedPerYear: 0, fixedTermPct: 0, energyPct: 0, energyPerKwh: 0 },
    newClientDiscounts: { fixedPerYearWithVat: 0, fixedTermPct: 0, energyPct: 0, energyPerKwh: 0 },
    payment: { directDebit: true, multibanco: true, cash: false },
    billing: { electronic: true, paper: true },
    links: {},
    texts: {},
    prices: { '6.9': prices },
  };
}

const offers = [
  offer('A', { '1': { fixedPerDay: 0.3, simple: 0.15 } }),
  offer('B', { '2': { fixedPerDay: 0.3, offEmpty: 0.19, empty: 0.09 } }),
];

/** Six months of a house: 120 W at night, 600 W from 7 h to 23 h, Sundays a bit more. */
function house() {
  const quarters = [];
  for (let date = '2026-04-20'; date < TODAY; date = addDays(date, 1)) {
    for (const ts of daySlots(date)) {
      const { hour, weekday } = lisbonParts(ts);
      const watts = (hour >= 7 && hour < 23 ? 600 : 120) + (weekday === 0 ? 100 : 0);
      quarters.push({ ts, energyWh: watts / 4 });
    }
  }
  return quarters;
}

const quarters = house();
const context: ToolContext = {
  today: TODAY,
  quarters,
  yearFrom: startOfLisbonDay(addDays(TODAY, -365)),
  tariffs: [tariff],
  daily: null,
  offers: async () => offers,
};

async function call(name: string, input: unknown = {}) {
  const outcome = await runTool(ENERGY_TOOLS, name, input, context);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result as Record<string, unknown>;
}

describe('energy tools', () => {
  it('each has a JSON schema the API accepts (an object, no $schema)', () => {
    for (const tool of ENERGY_TOOLS) {
      const schema = inputSchema(tool);
      expect(schema.type).toBe('object');
      expect(schema.$schema).toBeUndefined();
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('get_cost_breakdown gives the Report page’s total for September', async () => {
    const result = await call('get_cost_breakdown', { month: '2026-09' });
    const report = monthlyReport(quarters, '2026-09', tariff);
    expect(result.cost).toMatchObject({ total: formatCents(report!.cost!.totalCents) });
    expect(result.daysWithData).toBe(30);
  });

  it('simulate_tariffs gives the Tariffs page’s current cost and order', async () => {
    const result = await call('simulate_tariffs');
    const usage = annualUsage(
      quarters.filter(({ ts }) => ts >= context.yearFrom),
      tariff.periodsMap,
    )!;
    const comparison = compareOffers({ usage, current: tariff, offers, today: TODAY });
    expect(result.current).toMatchObject({ perYear: formatCents(comparison.currentCents) });
    expect((result.cheapest as { offer: string }[]).map((item) => item.offer)).toEqual(
      comparison.results.map((item) => item.offer.name),
    );
  });

  it('get_baseload gives the Consumption page’s night power and its cost', async () => {
    const result = await call('get_baseload');
    const year = quarters.filter(({ ts }) => ts >= context.yearFrom);
    const recent = recentBaseload(nightlyBaseload(year))!;
    expect(result.power).toBe(formatPower(recent.watts));
    expect(result.perYear).toMatchObject({
      cost: formatCents(baseloadCost(recent.watts, year, tariff)!.annualCents),
    });
  });

  it('forecast_month_bill gives the forecast card’s amount', async () => {
    const result = await call('forecast_month_bill');
    const chosen = currentMonthForecast(quarters, [tariff], null, TODAY)!;
    expect(result.forecast).toBe(formatCents(chosen.forecast.costCents!));
  });

  it('get_consumption_summary adds up a range and splits it by month', async () => {
    const result = await call('get_consumption_summary', { from: '2026-09-29', to: '2026-10-02' });
    // A weekday: 16 h × 600 W + 8 h × 120 W = 10,56 kWh; 2026-09-29 to 10-02 has no Sunday.
    expect(result).toMatchObject({ daysWithData: 4, total: '42,2 kWh', perDay: '10,6 kWh' });
    expect((result.months as unknown[]).length).toBe(2);
  });

  it('answers with an error the AI can read, never an exception', async () => {
    const bad = await runTool(ENERGY_TOOLS, 'get_cost_breakdown', { month: 'setembro' }, context);
    expect(bad).toMatchObject({ ok: false });
    const reversed = await runTool(
      ENERGY_TOOLS,
      'get_consumption_summary',
      { from: '2026-10-02', to: '2026-10-01' },
      context,
    );
    expect(reversed).toEqual({ ok: false, error: 'from is after to' });
    expect(await runTool(ENERGY_TOOLS, 'nope', {}, context)).toMatchObject({ ok: false });
  });

  it('get_anomalies lists the days the Consumption page lists', async () => {
    // Public holidays count as Sundays, and this house works through them.
    const found = recentAnomalies(quarters, tariff, null, TODAY);
    const result = await call('get_anomalies');
    expect(result.days).toBe(found.length);
    expect((result.list as { date: string }[]).map((item) => item.date)).toEqual(
      found.map((anomaly) => anomaly.date),
    );
  });
});
