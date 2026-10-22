// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  decodeSeconds,
  encodeSeconds,
  MISSING,
  READINGS_1S_BYTES,
  SECONDS_PER_MINUTE,
  type SecondReadings,
} from './readings-1s';

const minute = (power: (second: number) => number | null): SecondReadings => ({
  power: Array.from({ length: SECONDS_PER_MINUTE }, (_, s) => power(s)),
  nonActive: Array.from({ length: SECONDS_PER_MINUTE }, (_, s) => (s % 7 === 0 ? null : s * 3)),
  voltage: Array.from({ length: SECONDS_PER_MINUTE }, (_, s) => 2300 + s),
});

describe('readings_1s format 1', () => {
  it('round-trips values, extremes and missing seconds', () => {
    const readings = minute((s) => (s === 0 ? -32767 : s === 1 ? 32767 : s === 2 ? null : s * 10));
    const bytes = encodeSeconds(readings);
    expect(bytes.byteLength).toBe(READINGS_1S_BYTES);
    expect(bytes.byteLength).toBe(361);
    expect(decodeSeconds(bytes)).toEqual(readings);
  });

  it('keeps zero apart from a missing second', () => {
    const decoded = decodeSeconds(encodeSeconds(minute((s) => (s < 30 ? 0 : null))));
    expect(decoded.power[0]).toBe(0);
    expect(decoded.power[30]).toBeNull();
  });

  it('lays the bytes out as documented (version, then int16 little-endian blocks)', () => {
    const bytes = encodeSeconds(minute((s) => (s === 0 ? 0x0102 : null)));
    expect(bytes[0]).toBe(1);
    expect([bytes[1], bytes[2]]).toEqual([0x02, 0x01]);
    // Second 1 of the power block is missing: 0x8000.
    expect([bytes[3], bytes[4]]).toEqual([0x00, 0x80]);
    // The voltage block starts after 2 × 60 values: second 0 is 2300 = 0x08fc.
    expect([bytes[241], bytes[242]]).toEqual([0xfc, 0x08]);
  });

  it('decodes from a view into a larger buffer', () => {
    const readings = minute((s) => s);
    const larger = new Uint8Array(READINGS_1S_BYTES + 10);
    larger.set(encodeSeconds(readings), 5);
    expect(decodeSeconds(larger.subarray(5, 5 + READINGS_1S_BYTES))).toEqual(readings);
  });

  it('refuses values that do not fit, wrong lengths and unknown formats', () => {
    expect(() => encodeSeconds(minute(() => 32768))).toThrow(RangeError);
    expect(() => encodeSeconds(minute(() => MISSING))).toThrow(RangeError);
    expect(() => encodeSeconds(minute(() => 1.5))).toThrow(RangeError);
    expect(() => encodeSeconds({ ...minute(() => 1), voltage: [230] })).toThrow(RangeError);

    const bytes = encodeSeconds(minute(() => 1));
    bytes[0] = 2;
    expect(() => decodeSeconds(bytes)).toThrow(/format 2/);
    expect(() => decodeSeconds(new Uint8Array(0))).toThrow(RangeError);
    const short = encodeSeconds(minute(() => 1)).subarray(0, 100);
    expect(() => decodeSeconds(short)).toThrow(/361 bytes/);
  });
});
