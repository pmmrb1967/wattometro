// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A Lisbon day of per-second values as "Ao segundo" shows it: its steps and
 * cycles grouped by power (analyseDay), and the named appliances among them
 * with what each cost (nameDay). The same for the summary of the last days
 * (recent.ts) and the AI's get_appliances, so their numbers are the card's.
 */
import { applianceCostCents, shiftSavingCents, spreadOverQuarters } from '../domain/appliance-cost';
import type { TariffInput } from '../domain/tariff';
import type { Cents } from '../lib/money';
import { nextDate, startOfLisbonDay, type EpochSeconds, type LocalDate } from '../lib/time';
import type { Wh } from '../lib/units';
import {
  applianceTotals,
  classify,
  seriesEnergyWh,
  seriesQuarters,
  type Appliance,
  type ApplianceTotal,
} from './appliances';
import type { Cycle } from './cycles';
import { detectEvents, type PowerEvent } from './events';
import { findCycles } from './pipeline';
import { toSeries, type MinuteSeconds } from './series';
import { groupCycles, type CycleGroup } from './summary';

export interface DayAnalysis {
  day: LocalDate;
  /** Minutes with per-second values. */
  minutes: number;
  events: PowerEvent[];
  cycles: Cycle[];
  groups: CycleGroup[];
  energyWh: Wh;
  quarters: { ts: EpochSeconds; energyWh: Wh }[];
}

export function analyseDay(minutes: readonly MinuteSeconds[], day: LocalDate): DayAnalysis {
  const series = toSeries(minutes, startOfLisbonDay(day), startOfLisbonDay(nextDate(day)));
  const events = detectEvents(series);
  const cycles = findCycles(events, series);
  return {
    day,
    minutes: minutes.length,
    events,
    cycles,
    groups: groupCycles(cycles),
    energyWh: seriesEnergyWh(series),
    quarters: seriesQuarters(series),
  };
}

export interface NamedTotal extends ApplianceTotal {
  /** Its energy by the quarter hours of its uses. */
  quarters: { ts: EpochSeconds; energyWh: Wh }[];
  /** What it cost that day (src/domain/appliance-cost.ts); null without a tariff. */
  costCents: Cents | null;
  /** What it would have cost less in the cheapest period; null without a tariff. */
  savingCents: Cents | null;
}

export interface DayNames {
  byCycle: Map<number, Appliance>;
  totals: NamedTotal[];
  explainedPct: number | null;
}

/** The day's named appliances, with the tariff in force that day (or null). */
export function nameDay(
  analysis: DayAnalysis,
  appliances: readonly Appliance[],
  tariff: TariffInput | null,
): DayNames {
  const byCycle = classify(analysis.cycles, appliances);
  const { totals, explainedPct } = applianceTotals(analysis.cycles, byCycle, analysis.energyWh);
  return {
    byCycle,
    explainedPct,
    totals: totals.map((total) => {
      const quarters = spreadOverQuarters(total.energyWh, total.spans);
      return {
        ...total,
        quarters,
        costCents: tariff ? applianceCostCents(quarters, analysis.quarters, tariff) : null,
        savingCents: tariff ? shiftSavingCents(quarters, analysis.quarters, tariff) : null,
      };
    }),
  };
}
