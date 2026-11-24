// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household copy (docs/backup.md): what goes in it, section by section, and
 * how each row is checked, by the browser when it reads a file and by the
 * server when it takes rows back (POST /v1/backup/restore). Shared by both.
 *
 * Each row is a tuple in the order of its section's columns, named as the
 * database's (server/src/repo/backup.ts builds the queries from them). Blobs go
 * as base64url text. The seconds of the last 90 days (readings_1s) stay out:
 * they expire anyway, and the days the app found in them are in nilmDays.
 *
 * The sections, in the order they are written and put back: the small ones
 * first, so a copy put back over several days has the settings, the tariffs
 * and the quarter hours long before the minutes.
 */
import { z } from 'zod';

type ColumnType = 'int' | 'int?' | 'text' | 'text?' | 'blob';
type Column = readonly [name: string, type: ColumnType];

/** Longest text kept in a column (equipment notes and programmes are the long ones). */
const MAX_TEXT = 20_000;
/** Longest blob, as base64url (a day of NILM cycles; a minute of seconds is 361 bytes). */
const MAX_BLOB = 200_000;

const COLUMN_SCHEMAS: Record<ColumnType, z.ZodType<string | number | null>> = {
  int: z.number().int(),
  'int?': z.number().int().nullable(),
  text: z.string().max(MAX_TEXT),
  'text?': z.string().max(MAX_TEXT).nullable(),
  blob: z
    .string()
    .max(MAX_BLOB)
    .regex(/^[A-Za-z0-9_-]*$/),
};

export const SECTIONS = {
  household: [
    ['quality_zone', 'text?'],
    ['location_name', 'text?'],
    ['latitude_cdeg', 'int?'],
    ['longitude_cdeg', 'int?'],
    ['heating', 'text?'],
    ['air_conditioning', 'int?'],
    ['water_heating', 'text?'],
    ['hob', 'text?'],
    ['solar_panels', 'int?'],
    ['electric_car', 'int?'],
    ['budget_cents', 'int?'],
    ['budget_wh_per_day', 'int?'],
  ],
  tariffs: [
    ['id', 'text'],
    ['valid_from', 'text'],
    ['supplier', 'text?'],
    ['power_va', 'int'],
    ['option', 'text'],
    ['cycle', 'text'],
    ['periods_map', 'text'],
    ['fixed_per_day', 'int'],
    ['price_simple', 'int?'],
    ['price_off_empty', 'int?'],
    ['price_empty', 'int?'],
    ['price_full', 'int?'],
    ['price_peak', 'int?'],
    ['iec_per_kwh', 'int'],
    ['cav_per_month', 'int'],
    ['dgeg_per_month', 'int'],
    ['large_family', 'int'],
    ['created_at', 'int'],
    ['energy_discount_bp', 'int'],
    ['social_energy_per_kwh', 'int'],
    ['social_power_per_day', 'int'],
    ['social_financing_per_kwh', 'int'],
  ],
  devices: [
    ['id', 'text'],
    ['name', 'text'],
    ['model', 'text?'],
    ['script_version', 'text?'],
    ['token_hash', 'text'],
    ['created_at', 'int'],
    ['last_seen_at', 'int?'],
    ['revoked_at', 'int?'],
    ['firmware', 'text?'],
  ],
  equipment: [
    ['id', 'text'],
    ['name', 'text'],
    ['name_key', 'text'],
    ['kind', 'text?'],
    ['brand', 'text?'],
    ['model', 'text?'],
    ['room', 'text?'],
    ['rated_power_w', 'int?'],
    ['energy_class', 'text?'],
    ['notes', 'text?'],
    ['programmes', 'text'],
    ['created_at', 'int'],
    ['estimate', 'text?'],
  ],
  appliances: [
    ['id', 'text'],
    ['label', 'text'],
    ['power_w', 'int'],
    ['states_w', 'text'],
    ['pulsing', 'int'],
    ['created_at', 'int'],
    ['min_duration_s', 'int?'],
    ['max_duration_s', 'int?'],
    ['heats', 'int?'],
    ['equipment_id', 'text?'],
    ['period_s', 'int?'],
  ],
  alwaysOn: [
    ['id', 'text'],
    ['label', 'text'],
    ['quantity', 'int'],
    ['power_w', 'int?'],
    ['measured', 'int'],
    ['created_at', 'int'],
    ['equipment_id', 'text?'],
  ],
  signatures: [
    ['id', 'text'],
    ['device_id', 'text'],
    ['channel', 'int'],
    ['label', 'text'],
    ['start_at', 'int'],
    ['end_at', 'int'],
    ['created_at', 'int'],
  ],
  signatureSeconds: [
    ['signature_id', 'text'],
    ['ts', 'int'],
    ['data', 'blob'],
  ],
  outages: [
    ['device_id', 'text'],
    ['boot_at', 'int'],
    ['start_at', 'int?'],
    ['excluded', 'int'],
  ],
  daily: [
    ['meter', 'text'],
    ['day', 'text'],
    ['source', 'text'],
    ['minutes', 'int?'],
    ['energy_wh', 'int'],
    ['power_max_w', 'int?'],
    ['voltage_min_dv', 'int?'],
    ['voltage_max_dv', 'int?'],
    ['quarters', 'int?'],
    ['estimated', 'int?'],
    ['apparent_max_va', 'int?'],
    ['apparent_minutes', 'int?'],
    ['active_only_max_w', 'int?'],
  ],
  quarters: [
    ['meter', 'text'],
    ['ts', 'int'],
    ['source', 'text'],
    ['minutes', 'int?'],
    ['energy_wh', 'int'],
    ['power_max_w', 'int?'],
    ['voltage_min_dv', 'int?'],
    ['voltage_max_dv', 'int?'],
    ['estimated', 'int?'],
    ['apparent_max_va', 'int?'],
    ['apparent_minutes', 'int?'],
    ['active_only_max_w', 'int?'],
  ],
  voltage: [
    ['meter', 'text'],
    ['ts', 'int'],
    ['minutes', 'int'],
    ['voltage_avg_dv', 'int'],
    ['voltage_min_dv', 'int'],
    ['voltage_max_dv', 'int'],
  ],
  nilmDays: [
    ['meter', 'text'],
    ['day', 'text'],
    ['version', 'int'],
    ['minutes', 'int'],
    ['data', 'blob'],
    ['updated_at', 'int'],
  ],
  minutes: [
    ['device_id', 'text'],
    ['channel', 'int'],
    ['ts', 'int'],
    ['samples', 'int'],
    ['energy_wh', 'int'],
    ['power_avg_w', 'int'],
    ['power_min_w', 'int'],
    ['power_max_w', 'int'],
    ['voltage_min_dv', 'int'],
    ['voltage_avg_dv', 'int'],
    ['voltage_max_dv', 'int'],
    ['pf_avg_pct', 'int'],
    ['apparent_max_va', 'int?'],
  ],
} as const satisfies Record<string, readonly Column[]>;

export type Section = keyof typeof SECTIONS;

/** Written and put back in this order. */
export const SECTION_ORDER = Object.keys(SECTIONS) as Section[];

export const sectionSchema = z.enum(SECTION_ORDER as [Section, ...Section[]]);

export type CellValue = string | number | null;
export type Row = CellValue[];

function rowSchema(columns: readonly Column[]): z.ZodType<Row> {
  const cells = columns.map(([, type]) => COLUMN_SCHEMAS[type]);
  return z.tuple(cells as [z.ZodType<CellValue>, ...z.ZodType<CellValue>[]]);
}

export const ROW_SCHEMAS = Object.fromEntries(
  SECTION_ORDER.map((section) => [section, rowSchema(SECTIONS[section])]),
) as Record<Section, z.ZodType<Row>>;

/** Rows a page of POST /v1/backup/restore may carry (the server's CPU and D1's writes). */
export const MAX_RESTORE_ROWS = 500;

export const restoreBodySchema = z
  .object({ section: sectionSchema, rows: z.array(z.unknown()).min(1).max(MAX_RESTORE_ROWS) })
  .transform((body, context) => {
    const rows = z.array(ROW_SCHEMAS[body.section]).safeParse(body.rows);
    if (!rows.success) {
      context.addIssue({ code: 'custom', message: 'invalid rows' });
      return z.NEVER;
    }
    return { section: body.section, rows: rows.data };
  });

/** The file's first line (after it is opened: seal.ts). */
export const FORMAT = 'wattometro-casa';
export const FORMAT_VERSION = 1;

export const headerSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(FORMAT_VERSION),
  createdAt: z.number().int(),
  householdName: z.string().max(200),
});
export type BackupHeader = z.infer<typeof headerSchema>;

/** Every other line: one page of a section. */
export const lineSchema = z.tuple([sectionSchema, z.array(z.unknown())]);

/** The reminder's choices (Definições › Dados): days, 0 = never. */
export const REMIND_CHOICES = [7, 15, 30, 0] as const;
export type RemindDays = (typeof REMIND_CHOICES)[number];
export const DEFAULT_REMIND_DAYS: RemindDays = 7;
export const remindDaysSchema = z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(0)]);

/** "wattometro-casa-2026-11-24.wmbk" (the Lisbon date). */
export function backupFileName(lisbonDay: string): string {
  return `wattometro-casa-${lisbonDay}.wmbk`;
}

const DAY_SECONDS = 86_400;

/** The last copy is older than the reminder's days, or there is none (0 days: never late). */
export function isBackupLate(lastAt: number | null, remindDays: RemindDays, now: number): boolean {
  return remindDays > 0 && (lastAt === null || now - lastAt > remindDays * DAY_SECONDS);
}
