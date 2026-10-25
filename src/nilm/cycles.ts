// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * On/off pairs (Phase 8.1): each step down is matched with the latest step up
 * still open whose size it mirrors (the same appliance switching off), within
 * MAX_CYCLE_S. A cycle has a start, a duration, a power and its energy.
 *
 * Appliances with several states: a step down that mirrors no open appliance
 * but is a large share (PHASE_MIN_SHARE) of an open one's power, leaving at
 * least MIN_STEP_W on, is the latest such appliance changing state (a washing machine's
 * heating ending as its motor starts, in the same second); its cycle carries
 * the states. A mirrored step is always preferred, so the fridge switching off
 * is never taken for a phase of the kettle; the share keeps a step of
 * something switched on before the day began (the TV, 150 W) from being
 * taken for a phase of the water heater (1800 W).
 *
 * Periodic patterns (an induction hob pulsing) still come out as several
 * cycles.
 */
import type { EpochSeconds } from '../lib/time';
import { MIN_STEP_W, type PowerEvent } from './events';

/** Longest cycle looked for: a water heater in the empty period, an oven. */
export const MAX_CYCLE_S = 6 * 3600;
/** A state change takes at least this share of the appliance's power. */
export const PHASE_MIN_SHARE = 0.3;

/** How far an off step may differ from its on step: 30 W, or 10 % for large ones. */
export function matchToleranceW(deltaW: number): number {
  return Math.max(30, Math.abs(deltaW) * 0.1);
}

/** For non-active power: 30 var, or 25 % (it adds up less exactly than active power). */
function matchToleranceVar(deltaVar: number): number {
  return Math.max(30, Math.abs(deltaVar) * 0.25);
}

export interface CycleState {
  from: EpochSeconds;
  /** Measured power of the state, W. */
  powerW: number;
}

export interface Cycle {
  on: PowerEvent;
  off: PowerEvent;
  start: EpochSeconds;
  end: EpochSeconds;
  durationS: number;
  /** Of the first state: the mean of its two measured steps with one state, W. */
  powerW: number;
  /** The same scaled to 230 V (what compares across days), W. */
  powerW230: number;
  nonActiveVar: number;
  energyWh: number;
  /** One per state, in order (one for an appliance that only switches on and off). */
  states: CycleState[];
}

interface Level {
  from: EpochSeconds;
  w: number;
  w230: number;
  var: number;
}

interface Open {
  on: PowerEvent;
  levels: Level[];
}

const current = (open: Open) => open.levels.at(-1) as Level;

function close(open: Open, off: PowerEvent): Cycle {
  const { on, levels } = open;
  const durationS = off.ts - on.ts;
  if (levels.length === 1) {
    // The measured steps for the energy (what the meter counted), not the 230 V ones.
    const measuredW = (on.deltaW - off.deltaW) / 2;
    return {
      on,
      off,
      start: on.ts,
      end: off.ts,
      durationS,
      powerW: Math.round(measuredW),
      powerW230: Math.round((on.deltaW230 - off.deltaW230) / 2),
      nonActiveVar: Math.round((on.deltaVar - off.deltaVar) / 2),
      energyWh: Math.round((measuredW * durationS) / 3600),
      states: [{ from: on.ts, powerW: Math.round(measuredW) }],
    };
  }
  const states = levels.map((level, index) => ({
    from: level.from,
    // The last state: between its level and the step that ended it.
    powerW: index === levels.length - 1 ? (level.w - off.deltaW) / 2 : level.w,
  }));
  let energyWs = 0;
  states.forEach((state, index) => {
    const until = states[index + 1]?.from ?? off.ts;
    energyWs += state.powerW * (until - state.from);
  });
  return {
    on,
    off,
    start: on.ts,
    end: off.ts,
    durationS,
    powerW: on.deltaW,
    powerW230: on.deltaW230,
    nonActiveVar: on.deltaVar,
    energyWh: Math.round(energyWs / 3600),
    states: states.map((state) => ({ from: state.from, powerW: Math.round(state.powerW) })),
  };
}

export function pairCycles(events: readonly PowerEvent[]): Cycle[] {
  const open: Open[] = [];
  const cycles: Cycle[] = [];
  for (const event of events) {
    if (event.deltaW230 > 0) {
      open.push({
        on: event,
        levels: [{ from: event.ts, w: event.deltaW, w230: event.deltaW230, var: event.deltaVar }],
      });
      continue;
    }
    const recent = (item: Open) => event.ts - item.on.ts <= MAX_CYCLE_S;
    const mirrored = open.findLastIndex(
      (item) =>
        recent(item) &&
        Math.abs(current(item).w230 + event.deltaW230) <= matchToleranceW(current(item).w230) &&
        Math.abs(current(item).var + event.deltaVar) <= matchToleranceVar(current(item).var),
    );
    if (mirrored >= 0) {
      cycles.push(close(open[mirrored] as Open, event));
      open.splice(mirrored, 1);
      continue;
    }
    // The latest open appliance this step can be a state change of (the fridge may have
    // started since the washing machine did).
    const changing = open.findLast((item) => {
      const level = current(item);
      return (
        recent(item) &&
        level.w230 + event.deltaW230 >= MIN_STEP_W &&
        -event.deltaW230 >= PHASE_MIN_SHARE * level.w230
      );
    });
    if (changing) {
      const level = current(changing);
      changing.levels.push({
        from: event.ts,
        w: level.w + event.deltaW,
        w230: level.w230 + event.deltaW230,
        var: level.var + event.deltaVar,
      });
    }
  }
  return cycles.sort((a, b) => a.start - b.start);
}
