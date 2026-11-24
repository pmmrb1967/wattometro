// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household copy (docs/backup.md, src/backup/format.ts): its rows read a
 * page at a time, put back by joining (INSERT OR IGNORE: what is there stays),
 * and when the last copy was saved (household_backup, migration 0033).
 *
 * Every page is read along a primary key from a cursor (the last row's key),
 * so a page reads about the rows it returns. The minutes go device by device
 * and the signature seconds signature by signature, the household's own.
 */
import {
  DEFAULT_REMIND_DAYS,
  SECTIONS,
  type CellValue,
  type RemindDays,
  type Row,
  type Section,
} from '../../../src/backup/format';
import { fromBase64Url, toBase64Url } from '../../../src/lib/base64url';
import type { Sql, SqlValue, Statement } from '../db';

export interface BackupState {
  lastAt: number | null;
  remindDays: RemindDays;
}

export async function getBackupState(sql: Sql, householdId: string): Promise<BackupState> {
  const row = await sql.first<{ last_at: number | null; remind_days: RemindDays }>(
    'SELECT last_at, remind_days FROM household_backup WHERE household_id = ?',
    householdId,
  );
  return { lastAt: row?.last_at ?? null, remindDays: row?.remind_days ?? DEFAULT_REMIND_DAYS };
}

/** A copy was saved now. */
export async function recordBackup(sql: Sql, householdId: string, now: number): Promise<void> {
  await sql.run(
    `INSERT INTO household_backup (household_id, last_at, remind_days, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (household_id) DO UPDATE SET last_at = excluded.last_at, updated_at = excluded.updated_at`,
    householdId,
    now,
    DEFAULT_REMIND_DAYS,
    now,
  );
}

export async function setRemindDays(
  sql: Sql,
  householdId: string,
  days: RemindDays,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO household_backup (household_id, last_at, remind_days, updated_at) VALUES (?, NULL, ?, ?)
     ON CONFLICT (household_id) DO UPDATE SET remind_days = excluded.remind_days, updated_at = excluded.updated_at`,
    householdId,
    days,
    now,
  );
}

/**
 * About how many rows a copy reads, from the daily totals (a few rows a day):
 * per Shelly day its minutes, 96 quarter hours and 144 ten minutes; per
 * E-Redes day its quarter hours. Over the kept minutes after a purge.
 */
export async function backupEstimate(sql: Sql, householdId: string): Promise<number> {
  const rows = await sql.all<{ source: string; days: number; minutes: number; quarters: number }>(
    `SELECT source, COUNT(*) AS days, COALESCE(SUM(minutes), 0) AS minutes,
       COALESCE(SUM(quarters), 0) AS quarters
     FROM daily WHERE household_id = ? GROUP BY source`,
    householdId,
  );
  let total = 0;
  for (const row of rows) {
    total += row.days;
    total += row.source === 'shelly' ? row.minutes + row.days * (96 + 144) : row.quarters;
  }
  return total;
}

/** The database tables of the sections that are one table each. */
const TABLES: Record<Exclude<Section, 'household'>, string> = {
  tariffs: 'tariffs',
  devices: 'devices',
  equipment: 'equipment',
  appliances: 'appliances',
  alwaysOn: 'always_on',
  signatures: 'signatures',
  signatureSeconds: 'signature_seconds',
  outages: 'outages',
  daily: 'daily',
  quarters: 'readings_15m',
  voltage: 'voltage_10m',
  nilmDays: 'nilm_days',
  minutes: 'readings_1m',
};

/** Sections read whole in one page (a few rows to a few hundred per house), in key order. */
const WHOLE: Partial<Record<Section, string>> = {
  tariffs: 'valid_from',
  devices: 'id',
  equipment: 'id',
  appliances: 'id',
  alwaysOn: 'id',
  signatures: 'id',
  outages: 'boot_at, device_id',
};

/** Sections along the primary key (household_id, meter, key), and their page size. */
const BY_METER: Partial<Record<Section, { key: string; page: number }>> = {
  daily: { key: 'day', page: 2000 },
  quarters: { key: 'ts', page: 2000 },
  voltage: { key: 'ts', page: 2000 },
  nilmDays: { key: 'day', page: 10 },
};

/** Sections read one parent at a time, along its primary key. */
const BY_PARENT = {
  minutes: { parent: 'device_id', parents: 'devices', key: ['channel', 'ts'], page: 2000 },
  signatureSeconds: { parent: 'signature_id', parents: 'signatures', key: ['ts'], page: 240 },
} as const;

export type Cursor = (string | number)[];

export interface Page {
  rows: Row[];
  /** Where the next page starts; null: the section is done. */
  next: Cursor | null;
}

const columnsOf = (section: Section): string[] => SECTIONS[section].map(([name]) => name);
const blobColumns = (section: Section) =>
  SECTIONS[section].flatMap(([, type], index) => (type === 'blob' ? [index] : []));

/** A database row as a file row: blobs as base64url. */
function toRow(section: Section, record: Record<string, unknown>): Row {
  const blobs = new Set(blobColumns(section));
  return columnsOf(section).map((name, index) => {
    const value = record[name];
    if (blobs.has(index)) return toBase64Url(new Uint8Array(value as ArrayBuffer));
    return (value ?? null) as CellValue;
  });
}

async function parentIds(sql: Sql, table: string, householdId: string): Promise<string[]> {
  const rows = await sql.all<{ id: string }>(
    `SELECT id FROM ${table} WHERE household_id = ? ORDER BY id`,
    householdId,
  );
  return rows.map((row) => row.id);
}

/** One page of a section; `cursor` from the page before (null: the first). */
export async function exportPage(
  sql: Sql,
  householdId: string,
  section: Section,
  cursor: Cursor | null,
): Promise<Page> {
  const columns = columnsOf(section).join(', ');
  if (section === 'household') {
    const row = await sql.first<Record<string, unknown>>(
      `SELECT h.quality_zone, h.location_name, h.latitude_cdeg, h.longitude_cdeg,
         i.heating, i.air_conditioning, i.water_heating, i.hob, i.solar_panels, i.electric_car,
         b.cents AS budget_cents, b.wh_per_day AS budget_wh_per_day
       FROM households h
       LEFT JOIN household_installation i ON i.household_id = h.id
       LEFT JOIN household_budget b ON b.household_id = h.id
       WHERE h.id = ?`,
      householdId,
    );
    return { rows: row ? [toRow(section, row)] : [], next: null };
  }
  const table = TABLES[section];
  const whole = WHOLE[section];
  if (whole !== undefined) {
    const rows = await sql.all<Record<string, unknown>>(
      `SELECT ${columns} FROM ${table} WHERE household_id = ? ORDER BY ${whole}`,
      householdId,
    );
    return { rows: rows.map((row) => toRow(section, row)), next: null };
  }
  const byMeter = BY_METER[section];
  if (byMeter !== undefined) {
    const [meter, key] = cursor ?? ['', byMeter.key === 'ts' ? -1 : ''];
    const rows = await sql.all<Record<string, unknown>>(
      `SELECT ${columns} FROM ${table}
       WHERE household_id = ? AND (meter, ${byMeter.key}) > (?, ?)
       ORDER BY meter, ${byMeter.key} LIMIT ?`,
      householdId,
      meter ?? '',
      key ?? -1,
      byMeter.page,
    );
    const last = rows.at(-1);
    return {
      rows: rows.map((row) => toRow(section, row)),
      next:
        rows.length < byMeter.page || !last
          ? null
          : [last.meter as string, last[byMeter.key] as string | number],
    };
  }
  const plan = BY_PARENT[section as keyof typeof BY_PARENT];
  const parents = await parentIds(sql, plan.parents, householdId);
  let index = cursor ? parents.indexOf(String(cursor[0])) : 0;
  if (index === -1) return { rows: [], next: null };
  let after: (string | number)[] = cursor ? cursor.slice(1) : plan.key.map(() => -1);
  const rows: Row[] = [];
  let lastKey: (string | number)[] | null = null;
  while (index < parents.length && rows.length < plan.page) {
    const parent = parents[index] as string;
    const keys = plan.key.join(', ');
    const marks = plan.key.map(() => '?').join(', ');
    const found = await sql.all<Record<string, unknown>>(
      `SELECT ${columns} FROM ${table}
       WHERE ${plan.parent} = ? AND (${keys}) > (${marks})
       ORDER BY ${keys} LIMIT ?`,
      parent,
      ...after,
      plan.page - rows.length,
    );
    rows.push(...found.map((row) => toRow(section, row)));
    const last = found.at(-1);
    if (rows.length >= plan.page && last) {
      lastKey = [parent, ...plan.key.map((name) => last[name] as number)];
      break;
    }
    index += 1;
    after = plan.key.map(() => -1);
  }
  return { rows, next: lastKey };
}

/** D1 binds at most 100 values per statement. */
const MAX_PARAMS = 100;

/** INSERT OR IGNORE of the rows, each with the household first, in statements D1 accepts. */
function inserts(
  table: string,
  householdId: string,
  columns: readonly string[],
  rows: SqlValue[][],
): Statement[] {
  const width = columns.length + 1;
  const perStatement = Math.max(1, Math.floor(MAX_PARAMS / width));
  const statements: Statement[] = [];
  for (let start = 0; start < rows.length; start += perStatement) {
    const part = rows.slice(start, start + perStatement);
    const marks = `(${Array.from({ length: width }, () => '?').join(', ')})`;
    statements.push({
      query: `INSERT OR IGNORE INTO ${table} (household_id, ${columns.join(', ')}) VALUES ${part
        .map(() => marks)
        .join(', ')}`,
      params: part.flatMap((row) => [householdId, ...row]),
    });
  }
  return statements;
}

const sum = (counts: number[]) => counts.reduce((total, count) => total + count, 0);

/** The household's settings, only where it has none (a household keeps what it has). */
async function restoreHousehold(sql: Sql, householdId: string, row: Row, now: number) {
  const [zone, locationName, latitude, longitude, ...rest] = row;
  const installation = rest.slice(0, 6);
  const [cents, whPerDay] = rest.slice(6);
  const statements: Statement[] = [
    {
      query:
        'UPDATE OR IGNORE households SET quality_zone = ? WHERE id = ? AND quality_zone IS NULL',
      params: [zone ?? null, householdId],
    },
  ];
  if (locationName !== null && latitude !== null && longitude !== null) {
    statements.push({
      query: `UPDATE OR IGNORE households SET location_name = ?, latitude_cdeg = ?, longitude_cdeg = ?
              WHERE id = ? AND location_name IS NULL`,
      params: [locationName ?? null, latitude ?? null, longitude ?? null, householdId],
    });
  }
  if (installation.some((value) => value !== null)) {
    statements.push({
      query: `INSERT OR IGNORE INTO household_installation (household_id, heating, air_conditioning,
                water_heating, hob, solar_panels, electric_car, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [householdId, ...installation.map((value) => value ?? null), now],
    });
  }
  if (cents !== null && cents !== undefined && whPerDay !== null && whPerDay !== undefined) {
    statements.push({
      query: `INSERT OR IGNORE INTO household_budget (household_id, cents, wh_per_day, updated_at)
              VALUES (?, ?, ?, ?)`,
      params: [householdId, cents, whPerDay, now],
    });
  }
  return sum(await sql.batch(statements));
}

/**
 * Puts rows of a section back, keeping what the household already has; the
 * rows that changed. Rows that point at a device or a signature of another
 * household are left out, and a link to equipment it does not have is dropped.
 */
export async function restoreRows(
  sql: Sql,
  householdId: string,
  section: Section,
  rows: readonly Row[],
  now: number,
): Promise<number> {
  if (section === 'household') {
    return sum(await Promise.all(rows.map((row) => restoreHousehold(sql, householdId, row, now))));
  }
  const columns = columnsOf(section);
  const at = (name: string) => columns.indexOf(name);
  const blobs = blobColumns(section);
  let kept: SqlValue[][] = rows.map((row) =>
    row.map((value, index) =>
      blobs.includes(index) ? fromBase64Url(String(value)) : (value as SqlValue),
    ),
  );

  const owned = async (table: string, column: string) => {
    const ids = new Set(await parentIds(sql, table, householdId));
    kept = kept.filter((row) => ids.has(String(row[at(column)])));
  };
  if (['signatures', 'outages', 'minutes'].includes(section)) await owned('devices', 'device_id');
  if (section === 'signatureSeconds') await owned('signatures', 'signature_id');
  if (section === 'appliances' || section === 'alwaysOn') {
    const ids = new Set(await parentIds(sql, 'equipment', householdId));
    const link = at('equipment_id');
    kept = kept.map((row) => {
      const id = row[link];
      return id !== null && !ids.has(String(id))
        ? row.map((value, index) => (index === link ? null : value))
        : row;
    });
  }
  if (kept.length === 0) return 0;
  return sum(await sql.batch(inserts(TABLES[section], householdId, columns, kept)));
}
