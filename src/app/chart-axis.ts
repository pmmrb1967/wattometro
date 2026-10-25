// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Value axes of the hand-drawn charts (src/components/Charts.tsx): round steps
 * from zero to just above the largest value, labelled in the chart's unit.
 */
import type { Axis } from '../components/Charts';
import { kwhTick, powerTick } from '../lib/units';

const STEPS = [1, 2, 2.5, 5, 10];

/** 0, step, 2 × step … up to the first one at or above `max`; about `count` steps. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = (STEPS.find((s) => s * power >= rough) ?? 10) * power;
  const ticks: number[] = [];
  for (let i = 0; ticks.at(-1) === undefined || (ticks.at(-1) as number) < max; i++) {
    ticks.push(Math.round(i * step));
  }
  return ticks;
}

/** Power in W (integers): W below 1 kW, kW from there. */
export function powerAxis(maxW: number): Axis {
  const values = niceTicks(Math.max(maxW, 1));
  const inKw = (values.at(-1) as number) >= 1000;
  return {
    unit: inKw ? 'kW' : 'W',
    ticks: values.map((value) => ({ value, label: powerTick(value, inKw) })),
  };
}

/** Energy in Wh (integers), labelled in kWh. */
export function energyAxis(maxWh: number): Axis {
  return {
    unit: 'kWh',
    ticks: niceTicks(Math.max(maxWh, 1)).map((value) => ({ value, label: kwhTick(value) })),
  };
}
