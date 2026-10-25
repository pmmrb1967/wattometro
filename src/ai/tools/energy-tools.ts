// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The tools that work on the house's quarter hours and tariffs, each with the
 * same functions and inputs as its page, so the AI's numbers are the app's:
 * get_consumption_summary ("Consumo"), get_cost_breakdown ("Relatório"),
 * simulate_tariffs ("Tarifários"), get_baseload ("Consumo"), get_anomalies
 * ("Consumo", "Agora") and forecast_month_bill ("Agora").
 */
import { z } from 'zod';
import {
  recentBaseload,
  baseloadCost,
  monthlyBaseload,
  nightlyBaseload,
} from '../../domain/baseload';
import { annualUsage, compareOffers, type OfferResult } from '../../domain/compare';
import { addDays, monthDates } from '../../domain/consumption';
import { energyByPeriod, type Cost, type EnergyByPeriod } from '../../domain/electricity-cost';
import { monthlyReport, monthUsage } from '../../domain/monthly-report';
import { tariffOn, type BillingPeriod, type Tariff } from '../../domain/tariff';
import { t } from '../../i18n/pt-PT';
import { formatCents } from '../../lib/money';
import { lisbonDate, lisbonParts, startOfLisbonDay, type LocalDate } from '../../lib/time';
import { formatKva, formatKwh, formatPower, type Wh } from '../../lib/units';
import { recentAnomalies } from '../../ml/anomalies';
import { currentMonthForecast } from '../../ml/month-forecast';
import { defineTool, type ToolContext } from './tool';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const month = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM');
/** At most this many days in one summary (a year and a bit). */
const MAX_SUMMARY_DAYS = 400;
/** Offers listed by simulate_tariffs. */
const TOP_OFFERS = 5;
/** Anomalies listed by get_anomalies. */
const MAX_ANOMALIES = 10;

const tariffTexts = t.settings.tariff;
const periodName = (period: BillingPeriod) => tariffTexts.periods[period];
const kwh = (wh: Wh) => formatKwh(wh, 1);

function quartersBetween(context: ToolContext, fromTs: number, toTs: number) {
  return context.quarters.filter(({ ts }) => ts >= fromTs && ts < toTs);
}

/** Energy by period with each one's share, e.g. { Vazio: "120,3 kWh (41 %)" }. */
function periodsText(byPeriod: EnergyByPeriod): Record<string, string> {
  const total = Object.values(byPeriod).reduce((sum: number, wh) => sum + (wh ?? 0), 0);
  return Object.fromEntries(
    Object.entries(byPeriod).map(([period, wh]) => [
      periodName(period as BillingPeriod),
      `${kwh(wh ?? 0)} (${total > 0 ? Math.round(((wh ?? 0) * 100) / total) : 0} %)`,
    ]),
  );
}

function costText(cost: Cost) {
  return {
    energy: formatCents(cost.energyCents),
    power: formatCents(cost.powerCents),
    taxes: formatCents(cost.taxesCents),
    ...(cost.servicesCents > 0 ? { services: formatCents(cost.servicesCents) } : {}),
    total: formatCents(cost.totalCents),
  };
}

function tariffText(tariff: Tariff) {
  return {
    option: tariffTexts.options[tariff.option],
    cycle: tariffTexts.cycles[tariff.cycle],
    power: formatKva(tariff.powerVa),
    since: tariff.validFrom,
  };
}

const NO_TARIFF = 'No tariff set up: costs unknown (Definições → Tarifário).';

const consumptionSummary = defineTool({
  name: 'get_consumption_summary',
  description:
    'Energy used by the house between two dates (inclusive, Lisbon time): total, days with data, average per day, each month, and by tariff period with the tariff in force on the last day. Use it for kWh questions; for euros of a month use get_cost_breakdown.',
  input: z.strictObject({ from: date, to: date }),
  run({ from, to }, context) {
    if (from > to) throw new Error('from is after to');
    const days = daysBetween(from, to);
    if (days > MAX_SUMMARY_DAYS) throw new Error(`At most ${MAX_SUMMARY_DAYS} days`);
    const own = quartersBetween(context, startOfLisbonDay(from), startOfLisbonDay(addDays(to, 1)));
    if (own.length === 0) return { from, to, note: 'No data in this period.' };
    const dates = new Set(own.map(({ ts }) => lisbonDate(ts)));
    const totalWh = own.reduce((sum, { energyWh }) => sum + energyWh, 0);
    const months = [...new Set([...dates].map((day) => day.slice(0, 7)))].sort();
    const tariff = context.tariffs ? tariffOn(context.tariffs, to) : null;
    return {
      from,
      to,
      daysInPeriod: days,
      daysWithData: dates.size,
      total: kwh(totalWh),
      perDay: kwh(Math.round(totalWh / dates.size)),
      months: months.map((item) => {
        const usage = monthUsage(
          own.filter(({ ts }) => lisbonDate(ts).startsWith(item)),
          item,
        )!;
        return {
          month: item,
          total: kwh(usage.totalWh),
          daysWithData: usage.daysWithData,
          perDay: kwh(usage.perDayWh),
        };
      }),
      ...(tariff ? { byPeriod: periodsText(energyByPeriod(own, tariff)) } : {}),
    };
  },
});

/** Days from `from` to `to`, inclusive. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  return (
    Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1
  );
}

const costBreakdown = defineTool({
  name: 'get_cost_breakdown',
  description:
    'A month as on the "Relatório" page: energy, estimated cost (energy, power term, taxes, total, with VAT) with the tariff in force at the end of the month, the change per day against the month before and the same month a year before, baseload, highest quarter hour, and the app\'s suggestions. An estimate from the consumption, not the invoice. Use it for "quanto gastei em <mês>?".',
  input: z.strictObject({ month }),
  run({ month: wanted }, context) {
    const lastDay = monthDates(wanted).at(-1) as LocalDate;
    const tariff = context.tariffs ? tariffOn(context.tariffs, lastDay) : null;
    const report = monthlyReport(context.quarters, wanted, tariff);
    if (!report) return { month: wanted, note: 'No data in this month.' };
    const partial = wanted === context.today.slice(0, 7);
    return {
      month: wanted,
      ...(partial ? { note: 'The month is still going: up to yesterday or today.' } : {}),
      daysWithData: report.usage.daysWithData,
      daysInMonth: report.usage.days,
      energy: kwh(report.usage.totalWh),
      perDay: kwh(report.usage.perDayWh),
      vsPreviousMonthPerDayPct: report.vsPrevious,
      vsSameMonthLastYearPerDayPct: report.vsLastYear,
      byPeriod: periodsText(report.byPeriod),
      cost: report.cost ? costText(report.cost) : NO_TARIFF,
      ...(report.cost && report.usage.daysWithData < report.usage.days
        ? { costCovers: `Only the ${report.usage.daysWithData} days with data.` }
        : {}),
      tariff: tariff ? tariffText(tariff) : null,
      baseload: report.baseload
        ? {
            power: formatPower(report.baseload.watts),
            cost: report.baseload.cents !== null ? formatCents(report.baseload.cents) : null,
          }
        : null,
      highestQuarter: report.peak
        ? {
            at: `${lisbonDate(report.peak.ts)} ${String(lisbonParts(report.peak.ts).hour).padStart(2, '0')}:${String(lisbonParts(report.peak.ts).minute).padStart(2, '0')}`,
            averagePower: formatPower(report.peak.watts),
          }
        : null,
      suggestions: report.suggestions,
    };
  },
});

function offerText(result: OfferResult) {
  return {
    supplier: result.offer.supplier,
    offer: result.offer.name,
    option: tariffTexts.options[result.option],
    cycle: tariffTexts.cycles[result.cycle],
    perYear: formatCents(result.annualCents),
    savingPerYear: formatCents(result.savingCents),
    loyalty: result.offer.loyalty,
  };
}

const simulateTariffs = defineTool({
  name: 'simulate_tariffs',
  description:
    'As on the "Tarifários" page: what the last 365 days of this house would cost per year with the current contract and with each ERSE offer at the same contracted power (energy, power term, taxes and VAT; the best cycle per offer). Returns the current cost, the cheapest offers, the cheapest of each option (simple, bi-hourly, tri-hourly), and how much energy would have to move to the empty period for bi- or tri-hourly to pay off. Use it for "compensa-me o bi-horário?" or "qual o tarifário mais barato?".',
  input: z.strictObject({
    excludeLoyalty: z.boolean().optional().describe('Leave out offers with a loyalty period'),
    excludeServices: z
      .boolean()
      .optional()
      .describe('Leave out offers with mandatory extra services'),
  }),
  async run({ excludeLoyalty, excludeServices }, context) {
    const tariff = context.tariffs ? tariffOn(context.tariffs, context.today) : null;
    if (!tariff) return { note: NO_TARIFF };
    const quarters = context.quarters.filter(({ ts }) => ts >= context.yearFrom);
    const usage = annualUsage(quarters, tariff.periodsMap);
    if (!usage) return { note: 'Fewer than 30 days of data: not enough to compare.' };
    const offers = await context.offers();
    if (!offers) return { note: 'The ERSE offers could not be read now.' };
    const chosen = offers.filter(
      (offer) =>
        (!excludeLoyalty || !offer.loyalty) &&
        (!excludeServices || offer.servicesPerYearWithVat === 0),
    );
    const comparison = compareOffers({
      usage,
      current: tariff,
      offers: chosen,
      today: context.today,
    });
    const bestOf = (option: Tariff['option']) => {
      const best = comparison.results.find((result) => result.option === option);
      return best ? offerText(best) : null;
    };
    const shift = (option: 'bi' | 'tri') => {
      const value = comparison.shift[option];
      if (!value) return null;
      return value.neededWh === 0
        ? 'Already cheaper than the cheapest simple choice, with the current habits.'
        : `Move ${kwh(value.neededWh)} per year (about ${kwh(Math.round(value.neededWh / 12))} a month) from the other periods to the empty period for the cheapest offer to cost as much as the cheapest simple choice.`;
    };
    return {
      basedOn: `${usage.days} days of data${usage.extrapolated ? ' (extrapolated to a year)' : ''}, ${kwh(usage.totalWh)} per year`,
      current: { ...tariffText(tariff), perYear: formatCents(comparison.currentCents) },
      offersCompared: comparison.results.length,
      cheapest: comparison.results.slice(0, TOP_OFFERS).map(offerText),
      cheapestByOption: { simple: bestOf('simple'), bi: bestOf('bi'), tri: bestOf('tri') },
      moveToEmpty: { bi: shift('bi'), tri: shift('tri') },
    };
  },
});

const baseload = defineTool({
  name: 'get_baseload',
  description:
    'As on "Consumo": the baseload (what the house draws at night when nothing is in use: fridge, routers, standby), the median of the last nights, each month\'s, and what it costs per year with the tariff.',
  input: z.strictObject({}),
  run(_input, context) {
    const quarters = context.quarters.filter(({ ts }) => ts >= context.yearFrom);
    const nights = nightlyBaseload(quarters);
    const recent = recentBaseload(nights);
    if (!recent) return { note: 'No whole nights of data yet.' };
    const tariff = context.tariffs ? tariffOn(context.tariffs, context.today) : null;
    const cost = tariff ? baseloadCost(recent.watts, quarters, tariff) : null;
    return {
      power: formatPower(recent.watts),
      nights: recent.nights,
      perYear: cost
        ? { energy: kwh(cost.annualWh), cost: formatCents(cost.annualCents) }
        : NO_TARIFF,
      months: monthlyBaseload(nights)
        .slice(-12)
        .map((item) => ({ month: item.month, power: formatPower(item.watts) })),
    };
  },
});

const anomalies = defineTool({
  name: 'get_anomalies',
  description:
    'As on "Consumo": the days of the last 90 that used clearly more or less than usual for their kind of day (working day, Saturday, Sunday or holiday), newest first, with the hours that explain most of it and what the difference cost.',
  input: z.strictObject({}),
  run(_input, context) {
    const tariff = context.tariffs ? tariffOn(context.tariffs, context.today) : null;
    const found = recentAnomalies(context.quarters, tariff, context.daily, context.today);
    return {
      days: found.length,
      list: found.slice(0, MAX_ANOMALIES).map((anomaly) => ({
        date: anomaly.date,
        kind: anomaly.kind,
        used: kwh(anomaly.actualWh),
        usual: kwh(anomaly.expectedWh),
        changePct: Math.round(((anomaly.actualWh - anomaly.expectedWh) * 100) / anomaly.expectedWh),
        mostlyBetween: anomaly.span
          ? `${anomaly.span.from} h–${anomaly.span.to} h (${kwh(anomaly.span.excessWh)})`
          : null,
        cost: anomaly.excessCents !== null ? formatCents(anomaly.excessCents) : null,
      })),
    };
  },
});

const forecast = defineTool({
  name: 'forecast_month_bill',
  description:
    'As on "Agora": the forecast of this month\'s electricity bill (energy, power term, taxes and VAT) from the days measured so far and the house\'s usual pattern, with its likely range from how the method erred on past months.',
  input: z.strictObject({}),
  run(_input, context) {
    const chosen = currentMonthForecast(
      context.quarters,
      context.tariffs,
      context.daily,
      context.today,
    );
    if (!chosen) return { note: 'Not enough data for a forecast yet.' };
    const { forecast: result, range } = chosen;
    const money = result.costCents !== null;
    const format = (value: number) => (money ? formatCents(value) : kwh(value));
    return {
      month: result.month,
      knownDays: result.knownDays,
      daysInMonth: result.daysInMonth,
      spentSoFar: result.spentCents !== null ? formatCents(result.spentCents) : kwh(result.knownWh),
      forecastEnergy: kwh(result.totalWh),
      forecast: result.costCents !== null ? formatCents(result.costCents) : NO_TARIFF,
      likelyRange: range ? `${format(range.low)} – ${format(range.high)}` : null,
      usesTemperature: result.usesTemperature,
    };
  },
});

export const ENERGY_TOOLS = [
  consumptionSummary,
  costBreakdown,
  simulateTariffs,
  baseload,
  anomalies,
  forecast,
];
