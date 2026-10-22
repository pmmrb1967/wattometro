// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Binary format of one minute of per-second values (readings_1s.data),
 * shared by the server and the browser. Specification: docs/readings-1s.md.
 */

export const SECONDS_PER_MINUTE = 60;
export const READINGS_1S_FORMAT = 1;
/** Marks a second without a reading; never zero, which is a valid measurement. */
export const MISSING = -32768;
export const MAX_INT16 = 32767;
export const READINGS_1S_BYTES = 1 + 3 * SECONDS_PER_MINUTE * 2;

/** One value per second of the minute (index = second); null when missing. */
export type Series = (number | null)[];

export interface SecondReadings {
  /** Active power, W. */
  power: Series;
  /** Non-active power sqrt(S² − P²), var, unsigned. */
  nonActive: Series;
  /** Voltage, decivolts. */
  voltage: Series;
}

const ORDER = ['power', 'nonActive', 'voltage'] as const;

export function encodeSeconds(readings: SecondReadings): Uint8Array {
  const bytes = new Uint8Array(READINGS_1S_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, READINGS_1S_FORMAT);
  ORDER.forEach((name, block) => {
    const series = readings[name];
    if (series.length !== SECONDS_PER_MINUTE) {
      throw new RangeError(`${name}: expected ${SECONDS_PER_MINUTE} values, got ${series.length}`);
    }
    series.forEach((value, second) => {
      if (value !== null && (!Number.isInteger(value) || Math.abs(value) > MAX_INT16)) {
        throw new RangeError(`${name}[${second}]: ${value} is not an int16 reading`);
      }
      view.setInt16(1 + (block * SECONDS_PER_MINUTE + second) * 2, value ?? MISSING, true);
    });
  });
  return bytes;
}

export function decodeSeconds(bytes: Uint8Array): SecondReadings {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = bytes.byteLength > 0 ? view.getUint8(0) : undefined;
  if (format !== READINGS_1S_FORMAT) throw new RangeError(`unknown readings_1s format ${format}`);
  if (bytes.byteLength !== READINGS_1S_BYTES) {
    throw new RangeError(
      `readings_1s format 1 has ${READINGS_1S_BYTES} bytes, got ${bytes.byteLength}`,
    );
  }
  const series = (block: number): Series =>
    Array.from({ length: SECONDS_PER_MINUTE }, (_, second) => {
      const value = view.getInt16(1 + (block * SECONDS_PER_MINUTE + second) * 2, true);
      return value === MISSING ? null : value;
    });
  return { power: series(0), nonActive: series(1), voltage: series(2) };
}
