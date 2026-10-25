// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Per-second values of a meter laid out as one continuous series (one slot per
 * second, MISSING where the Shelly sent nothing), from the records of
 * GET /v1/seconds (server/src/repo/seconds.ts; docs/readings-1s.md).
 */
import {
  decodeSeconds,
  MISSING,
  READINGS_1S_BYTES,
  SECONDS_PER_MINUTE,
  type SecondReadings,
} from '../lib/readings-1s';
import type { EpochSeconds } from '../lib/time';

export { MISSING };

/** Record of GET /v1/seconds: uint32 ts (start of the minute) · 361 bytes readings_1s. */
export const SECONDS_RECORD_BYTES = 4 + READINGS_1S_BYTES;

export interface SecondsSeries {
  /** The first second; slot i is second start + i. */
  start: EpochSeconds;
  /** Active power, W. */
  power: Int32Array;
  /** Non-active power sqrt(S² − P²), var. */
  nonActive: Int32Array;
  /** Voltage, decivolts. */
  voltage: Int32Array;
}

export interface MinuteSeconds {
  ts: EpochSeconds;
  readings: SecondReadings;
}

export function decodeSecondsRecords(records: ArrayBuffer | Uint8Array): MinuteSeconds[] {
  const bytes = records instanceof Uint8Array ? records : new Uint8Array(records);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minutes: MinuteSeconds[] = [];
  for (let offset = 0; offset + SECONDS_RECORD_BYTES <= bytes.byteLength;) {
    const ts = view.getUint32(offset, true);
    const data = bytes.subarray(offset + 4, offset + SECONDS_RECORD_BYTES);
    minutes.push({ ts, readings: decodeSeconds(data) });
    offset += SECONDS_RECORD_BYTES;
  }
  return minutes;
}

/** The seconds of [from, to); those not in `minutes` are MISSING. */
export function toSeries(
  minutes: readonly MinuteSeconds[],
  from: EpochSeconds,
  to: EpochSeconds,
): SecondsSeries {
  const length = to - from;
  const series: SecondsSeries = {
    start: from,
    power: new Int32Array(length).fill(MISSING),
    nonActive: new Int32Array(length).fill(MISSING),
    voltage: new Int32Array(length).fill(MISSING),
  };
  for (const { ts, readings } of minutes) {
    for (let second = 0; second < SECONDS_PER_MINUTE; second++) {
      const slot = ts + second - from;
      if (slot < 0 || slot >= length) continue;
      series.power[slot] = readings.power[second] ?? MISSING;
      series.nonActive[slot] = readings.nonActive[second] ?? MISSING;
      series.voltage[slot] = readings.voltage[second] ?? MISSING;
    }
  }
  return series;
}
