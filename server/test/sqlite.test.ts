// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { memorySql } from './sqlite';

const { sql } = memorySql();

it('fails a query that would read a large table whole', async () => {
  await expect(sql.all('SELECT * FROM readings_15m WHERE energy_wh > 0')).rejects.toThrow(
    /Reads a large table whole/,
  );
  await expect(
    sql.all('SELECT * FROM voltage_10m WHERE household_id = ? AND minutes > 0', 'h'),
  ).rejects.toThrow(/Reads a large table whole/);
  // The old outage lookup: by device only, every minute it ever sent.
  await expect(
    sql.first('SELECT MAX(ts) FROM readings_1m WHERE device_id = ? AND ts < ?', 'd', 0),
  ).rejects.toThrow(/Reads a large table whole/);
});

it('lets ranges on the keys through', async () => {
  await expect(
    sql.all(
      'SELECT * FROM readings_15m WHERE household_id = ? AND meter = ? AND ts >= ? AND ts < ?',
      'h',
      'eredes',
      0,
      900,
    ),
  ).resolves.toEqual([]);
  await expect(
    sql.all('SELECT * FROM voltage_10m WHERE household_id = ? AND ts >= ? AND ts < ?', 'h', 0, 1),
  ).resolves.toEqual([]);
});
