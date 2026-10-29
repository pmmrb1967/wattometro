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
 * A compressor draws more the longer it runs (a heat-pump dryer on 27/10:
 * on +230 W, then +30 to +50 W in small steps or gradually, off −310 to
 * −340 W). A step down up to RISE_MAX_SHARE larger than an open appliance's,
 * that brings the house back to its level before that appliance, is it
 * switching off; the small steps it rose by, opened since, go with it.
 *
 * A motor or a compressor with a soft start switches on in a ramp (a dryer on
 * 28/10: +149, +135 and +164 W about 30 s apart, then −487 W 27 min later):
 * steps up one right after another, with nothing between them, are one
 * appliance switching on (START_RAMP_S, RAMP_MIN_W, RAMP_MAX_W keep a kettle
 * and the fridge switching on a few seconds apart from becoming one).
 *
 * Two appliances switching off in the same second (a dryer's motor and its
 * compressor at the end of the programme) make one step, the sum of both: it
 * closes the two open ones it mirrors. Without this, the motor stayed open
 * and was paired with a step hours later.
 *
 * Periodic patterns (an induction hob pulsing) come out as several cycles
 * here; mergePulses (periodic.ts) makes each run of them one.
 */
import type { EpochSeconds } from '../lib/time';
import { MIN_STEP_W, type PowerEvent } from './events';

/** Longest cycle looked for: a water heater in the empty period, an oven. */
export const MAX_CYCLE_S = 6 * 3600;
/** A state change takes at least this share of the appliance's power. */
export const PHASE_MIN_SHARE = 0.3;
/** Two steps down at most this far apart can be one appliance switching off. */
export const SPLIT_OFF_S = 20;
/** Each of two appliances switching off in the same second draws at least this, W. */
export const PAIR_MIN_W = 2 * MIN_STEP_W;
/** Steps up at most this far apart, with nothing between them, can be one start. */
export const START_RAMP_S = 45;
/** Each step of a start ramp draws at least this, W (smaller ones are a compressor rising). */
export const RAMP_MIN_W = 100;
/** A start ramp adds up to at most this, W. */
export const RAMP_MAX_W = 1000;
/** How much larger than its on step an off step may be when the house goes back to its level. */
export const RISE_MAX_SHARE = 0.6;

/** How far an off step may differ from its on step: 30 W, or 10 % for large ones. */
export function matchToleranceW(deltaW: number): number {
  return Math.max(30, Math.abs(deltaW) * 0.1);
}

/**
 * For non-active power: 30 var, 25 % (it adds up less exactly than active
 * power), or 5 % of the active power. √(S² − P²) is ill-conditioned when Q is
 * small next to P: a coffee machine's 1.3 kW resistance (29/10) switched on
 * with +85 var and off with −52 var.
 */
function matchToleranceVar(deltaVar: number, deltaW: number): number {
  return Math.max(30, Math.abs(deltaVar) * 0.25, Math.abs(deltaW) * 0.05);
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
  /** A run of pulses made one (periodic.ts): how many, and the seconds they were on. */
  pulses?: { count: number; onS: number };
  /** A whole programme made one (programmes.ts): its heatings, and the seconds they were on. */
  heats?: { count: number; onS: number };
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
  /** Its last step up (the on step, or the last of a start ramp). */
  lastUpTs: EpochSeconds;
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

/** The part of an off step that switched one open appliance off (when one step closes two). */
function share(off: PowerEvent, level: Level): PowerEvent {
  return { ...off, deltaW: -level.w, deltaW230: -level.w230, deltaVar: -level.var };
}

const mirrors = (level: { w230: number; var: number }, event: PowerEvent) =>
  Math.abs(level.w230 + event.deltaW230) <= matchToleranceW(level.w230) &&
  Math.abs(level.var + event.deltaVar) <= matchToleranceVar(level.var, level.w230);

/**
 * The small steps an appliance rose by after `since` (each seen as something
 * switching on) are taken off the open ones: they switched off with it.
 */
function absorbSteps(open: Open[], since: EpochSeconds, extraW: number): void {
  let leftW = extraW + MIN_STEP_W;
  for (let at = open.length - 1; at >= 0; at--) {
    const other = open[at] as Open;
    const w = current(other).w;
    if (other.on.ts > since && other.levels.length === 1 && w <= leftW) {
      open.splice(at, 1);
      leftW -= w;
    }
  }
}

/**
 * Closes the two open appliances whose sum the off step mirrors best, up to
 * `slackW` more (small steps one of them rose by, taken off the open ones).
 */
function closePair(
  open: Open[],
  event: PowerEvent,
  recent: (item: Open) => boolean,
  cycles: Cycle[],
  slackW: number,
): boolean {
  let pair: [number, number] | null = null;
  let pairError = Infinity;
  for (let first = 0; first < open.length; first++) {
    for (let second = first + 1; second < open.length; second++) {
      const a = open[first] as Open;
      const b = open[second] as Open;
      if (!recent(a) || !recent(b)) continue;
      // Steps of 30–50 W are a compressor rising, not an appliance.
      if (Math.min(current(a).w230, current(b).w230) < PAIR_MIN_W) continue;
      const sumW230 = current(a).w230 + current(b).w230;
      const sumVar = current(a).var + current(b).var;
      const overW = -event.deltaW230 - sumW230;
      const tolerance = matchToleranceW(sumW230);
      const fits =
        overW >= -tolerance &&
        overW <= tolerance + slackW &&
        Math.abs(sumVar + event.deltaVar) <= matchToleranceVar(sumVar, sumW230);
      if (fits && Math.abs(overW) < pairError) {
        pair = [first, second];
        pairError = Math.abs(overW);
      }
    }
  }
  if (!pair) return false;
  const [a, b] = [open[pair[0]] as Open, open[pair[1]] as Open];
  for (const item of [a, b]) cycles.push(close(item, share(event, current(item))));
  open.splice(pair[1], 1);
  open.splice(pair[0], 1);
  if (slackW > 0) absorbSteps(open, b.on.ts, -event.deltaW - current(a).w - current(b).w);
  return true;
}

/** Closes the open appliance(s) an off step switched off; false when it fits none. */
function closeOff(open: Open[], event: PowerEvent, cycles: Cycle[]): boolean {
  const recent = (item: Open) => event.ts - item.on.ts <= MAX_CYCLE_S;
  const mirrored = open.findLastIndex((item) => recent(item) && mirrors(current(item), event));
  if (mirrored >= 0) {
    cycles.push(close(open[mirrored] as Open, event));
    open.splice(mirrored, 1);
    return true;
  }
  // Two appliances switching off in the same second: the pair it mirrors.
  if (closePair(open, event, recent, cycles, 0)) return true;
  // An appliance that drew more as it ran: the house goes back to its level before it.
  const risen = open.findLastIndex((item) => {
    const level = current(item);
    const extraW = -event.deltaW - level.w;
    if (!recent(item) || item.levels.length > 1 || extraW <= 0) return false;
    return (
      extraW <= RISE_MAX_SHARE * level.w &&
      Math.abs(event.afterW - item.on.beforeW) <= matchToleranceW(level.w) + MIN_STEP_W &&
      Math.abs(level.var + event.deltaVar) <= matchToleranceVar(level.var, level.w230)
    );
  });
  if (risen >= 0) {
    const item = open[risen] as Open;
    cycles.push(close(item, event));
    open.splice(risen, 1);
    absorbSteps(open, item.on.ts, -event.deltaW - current(item).w);
    return true;
  }
  // The same, a little more: one of them rose in small steps since it switched on.
  return closePair(open, event, recent, cycles, MIN_STEP_W);
}

/** Two steps a few seconds apart as one, from the level before the first to after the second. */
function joinSteps(first: PowerEvent, second: PowerEvent): PowerEvent {
  return {
    ...second,
    deltaW: first.deltaW + second.deltaW,
    deltaW230: first.deltaW230 + second.deltaW230,
    deltaVar: first.deltaVar + second.deltaVar,
    beforeW: first.beforeW,
    transientS: second.ts - first.ts,
  };
}

export function pairCycles(events: readonly PowerEvent[]): Cycle[] {
  const open: Open[] = [];
  const cycles: Cycle[] = [];
  for (let index = 0; index < events.length; index++) {
    const event = events[index] as PowerEvent;
    if (event.deltaW230 > 0) {
      // A soft start: the previous event was a step up of the latest open appliance.
      const ramp = open.at(-1);
      const previous = events[index - 1];
      if (
        ramp !== undefined &&
        previous !== undefined &&
        ramp.levels.length === 1 &&
        previous.ts === ramp.lastUpTs &&
        event.ts - previous.ts <= START_RAMP_S &&
        Math.min(event.deltaW230, previous.deltaW230) >= RAMP_MIN_W &&
        current(ramp).w230 + event.deltaW230 <= RAMP_MAX_W
      ) {
        const level = current(ramp);
        ramp.on = {
          ...ramp.on,
          deltaW: ramp.on.deltaW + event.deltaW,
          deltaW230: ramp.on.deltaW230 + event.deltaW230,
          deltaVar: ramp.on.deltaVar + event.deltaVar,
          transientS: event.ts - ramp.on.ts,
        };
        ramp.levels[0] = {
          from: ramp.on.ts,
          w: level.w + event.deltaW,
          w230: level.w230 + event.deltaW230,
          var: level.var + event.deltaVar,
        };
        ramp.lastUpTs = event.ts;
        continue;
      }
      open.push({
        on: event,
        levels: [{ from: event.ts, w: event.deltaW, w230: event.deltaW230, var: event.deltaVar }],
        lastUpTs: event.ts,
      });
      continue;
    }
    if (closeOff(open, event, cycles)) continue;
    // An appliance switching off in two steps a few seconds apart (a compressor of 27/10:
    // −191 W, then −132 W 15 s later): the two as one.
    const next = events[index + 1];
    if (
      next !== undefined &&
      next.deltaW230 < 0 &&
      next.ts - event.ts <= SPLIT_OFF_S &&
      closeOff(open, joinSteps(event, next), cycles)
    ) {
      index++;
      continue;
    }
    // The latest open appliance this step can be a state change of (the fridge may have
    // started since the washing machine did).
    const changing = open.findLast((item) => {
      const level = current(item);
      return (
        event.ts - item.on.ts <= MAX_CYCLE_S &&
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
