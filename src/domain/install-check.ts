// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Is the Shelly on the board installed right? From its last minute
 * (GET /v1/now): it sends, it reads the voltage, the clamp is the right way
 * round and around something. Sources in docs/shelly.md, "Instalação no quadro":
 * negative active power while the house consumes means the clamp is the wrong
 * way round (K–L against the current); about nothing means it is on the
 * neutral, around both conductors, or not closed around the cable.
 */
import type { EpochSeconds } from '../lib/time';
import type { Decivolts, Watts } from '../lib/units';
import type { VoltageLimits } from './voltage';

/** The script sends every minute: three without news means it is not sending. */
export const STALE_SECONDS = 180;
/**
 * Below this, in either direction, the clamp sees about nothing. A house in use
 * always draws more (router, fridge, devices on standby): a judgement, not a
 * reference value, so the message also says "or nothing on right now".
 */
export const IDLE_W = 10;

export type CheckId = 'sending' | 'voltage' | 'direction' | 'clamp';
export type CheckState = 'ok' | 'warn' | 'fail';

export interface InstallCheck {
  id: CheckId;
  state: CheckState;
  /** What the check found, for the message: "never", "stale", "low", "high", "reversed", "idle". */
  finding?: 'never' | 'stale' | 'low' | 'high' | 'reversed' | 'idle';
}

export interface InstallReading {
  now: EpochSeconds;
  lastSeenAt: EpochSeconds | null;
  latest: { ts: EpochSeconds; powerAvgW: Watts; voltageAvgDv: Decivolts } | null;
}

/** The checks in order; the ones after "sending" only when the last minute is recent. */
export function checkInstall(reading: InstallReading, limits: VoltageLimits): InstallCheck[] {
  const { now, lastSeenAt, latest } = reading;
  if (lastSeenAt === null) return [{ id: 'sending', state: 'fail', finding: 'never' }];
  if (now - lastSeenAt > STALE_SECONDS || !latest || now - latest.ts > STALE_SECONDS) {
    return [{ id: 'sending', state: 'fail', finding: 'stale' }];
  }
  const checks: InstallCheck[] = [{ id: 'sending', state: 'ok' }];

  const volts = latest.voltageAvgDv;
  checks.push(
    volts < limits.lowDv
      ? { id: 'voltage', state: 'warn', finding: 'low' }
      : volts > limits.highDv
        ? { id: 'voltage', state: 'warn', finding: 'high' }
        : { id: 'voltage', state: 'ok' },
  );

  const watts = latest.powerAvgW;
  if (watts < -IDLE_W) {
    checks.push({ id: 'direction', state: 'fail', finding: 'reversed' });
  } else if (watts <= IDLE_W) {
    checks.push({ id: 'clamp', state: 'warn', finding: 'idle' });
  } else {
    checks.push({ id: 'direction', state: 'ok' }, { id: 'clamp', state: 'ok' });
  }
  return checks;
}
