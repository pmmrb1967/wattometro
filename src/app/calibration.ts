// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A calibration in progress ("Liguei agora" … "Desliguei agora"), kept in this
 * browser so closing the app meanwhile does not lose it. Once marked, it is
 * sent when the Shelly has had time to send those minutes (each one goes up
 * after it ends): first FIRST_TRY_S after the end, then every RETRY_S, until
 * GIVE_UP_S.
 */
import { z } from 'zod';
import type { EpochSeconds } from '../lib/time';

export const FIRST_TRY_S = 75;
export const RETRY_S = 60;
export const GIVE_UP_S = 15 * 60;
/** As on the server (server/src/repo/signatures.ts). */
export const MAX_RUN_S = 4 * 3600;

const Pending = z.object({
  meter: z.string(),
  label: z.string(),
  from: z.number().int(),
  to: z.number().int().nullable(),
});
export type PendingCalibration = z.infer<typeof Pending>;

const key = (household: string) => `wattometro.calibration.${household}`;

export function loadPending(household: string): PendingCalibration | null {
  try {
    const parsed = Pending.safeParse(JSON.parse(localStorage.getItem(key(household)) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function savePending(household: string, pending: PendingCalibration | null): void {
  try {
    if (pending) localStorage.setItem(key(household), JSON.stringify(pending));
    else localStorage.removeItem(key(household));
  } catch {
    // Not kept on this device; the calibration goes on while the page is open.
  }
}

/** When to send a marked run: null while it still runs; 'late' once it is time to give up. */
export function nextTry(
  pending: PendingCalibration,
  lastTry: EpochSeconds | null,
  now: EpochSeconds,
): 'now' | 'wait' | 'late' | null {
  if (pending.to === null) return null;
  if (now >= pending.to + GIVE_UP_S) return 'late';
  if (now < pending.to + FIRST_TRY_S) return 'wait';
  return lastTry === null || now - lastTry >= RETRY_S ? 'now' : 'wait';
}

/**
 * The run between two Lisbon wall-clock times of a day ("HH:MM"); an end before
 * the start is on the next day. Null when a time does not exist.
 */
export function runFromTimes(
  day: string,
  start: string,
  end: string,
  at: (day: string, hour: number, minute: number) => EpochSeconds | null,
  next: (day: string) => string,
): { from: EpochSeconds; to: EpochSeconds } | null {
  const parse = (time: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    return match ? [Number(match[1]), Number(match[2])] : null;
  };
  const a = parse(start);
  const b = parse(end);
  if (!a || !b) return null;
  const from = at(day, a[0] as number, a[1] as number);
  const endsNextDay =
    (b[0] as number) * 60 + (b[1] as number) <= (a[0] as number) * 60 + (a[1] as number);
  const to = at(endsNextDay ? next(day) : day, b[0] as number, b[1] as number);
  return from === null || to === null ? null : { from, to };
}
