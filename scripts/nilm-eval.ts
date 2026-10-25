// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The event detection (src/nilm/) on real days of per-second values, kept in
 * fixtures/private/nilm (never committed).
 *
 *   pnpm nilm:eval fetch 2026-10-26 [more days] [--local]
 *       downloads each Shelly channel's per-second values of those Lisbon days
 *       (wrangler, the remote D1 unless --local; 1440 rows per day and channel,
 *       by primary key) as fixtures/private/nilm/<day>_<device>-<channel>.bin
 *   pnpm nilm:eval [day ...]
 *       runs the detection on the kept days (all, or those given) and prints the
 *       groups of cycles and the large steps left unpaired; with
 *       fixtures/private/nilm/notes.json, also which noted appliances it found:
 *         {"notes": [{"day": "2026-10-26", "from": "19:40", "to": "19:43",
 *                     "appliance": "chaleira", "watts": 2000}]}
 *       ("to" and "watts" optional; times in Lisbon).
 *
 * Prints to the terminal only; record just counts in planning/plan.md.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { READINGS_1S_BYTES } from '../src/lib/readings-1s';
import {
  formatDuration,
  formatLisbonTime,
  lisbonLocalTime,
  nextDate,
  startOfLisbonDay,
  type EpochSeconds,
} from '../src/lib/time';
import { formatKwh, formatPower } from '../src/lib/units';
import { pairCycles, type Cycle } from '../src/nilm/cycles';
import { detectEvents, DETECTOR_VERSION } from '../src/nilm/events';
import { decodeSecondsRecords, SECONDS_RECORD_BYTES, toSeries } from '../src/nilm/series';
import { groupCycles } from '../src/nilm/summary';

const FOLDER = resolve('fixtures', 'private', 'nilm');
const DATABASE = 'wattometro';
const CONFIG = 'server/wrangler.toml';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** How far a noted time may be from the detected one (a clock read by eye). */
const START_SLACK_S = 120;
const END_SLACK_S = 180;
/** Unpaired steps at least this big are listed (smaller ones are mostly noise). */
const LIST_UNPAIRED_W = 300;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const days = args.filter((arg) => DAY.test(arg));

function d1(sql: string): unknown[] {
  const target = args.includes('--local') ? '--local' : '--remote';
  const line = sql.replace(/\s+/g, ' ').trim();
  const command = `pnpm exec wrangler d1 execute ${DATABASE} ${target} -c ${CONFIG} --json --command "${line}"`;
  const output = execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  const parsed = z
    .array(z.object({ results: z.array(z.unknown()) }))
    .parse(JSON.parse(output.toString()));
  return parsed[0]?.results ?? [];
}

function fetchDays(): void {
  if (days.length === 0) fail('Which days? e.g. pnpm nilm:eval fetch 2026-10-26');
  mkdirSync(FOLDER, { recursive: true });
  const devices = z
    .array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), name: z.string() }))
    .parse(d1('SELECT id, name FROM devices'));
  for (const day of days) {
    const from = startOfLisbonDay(day);
    const to = startOfLisbonDay(nextDate(day));
    for (const device of devices) {
      for (const channel of [0, 1]) {
        const rows = z.array(z.object({ ts: z.number().int(), data: z.string() })).parse(
          d1(
            `SELECT ts, hex(data) AS data FROM readings_1s WHERE device_id = '${device.id}'
               AND channel = ${channel} AND ts >= ${from} AND ts < ${to} ORDER BY ts`,
          ),
        );
        const kept = rows.filter((row) => row.data.length === READINGS_1S_BYTES * 2);
        if (kept.length === 0) continue;
        const records = new Uint8Array(kept.length * SECONDS_RECORD_BYTES);
        const view = new DataView(records.buffer);
        kept.forEach((row, index) => {
          view.setUint32(index * SECONDS_RECORD_BYTES, row.ts, true);
          records.set(Buffer.from(row.data, 'hex'), index * SECONDS_RECORD_BYTES + 4);
        });
        const file = join(FOLDER, `${day}_${device.id}-${channel}.bin`);
        writeFileSync(file, records);
        console.log(`${day} ${device.name} channel ${channel}: ${kept.length} minutes`);
      }
    }
  }
}

const notesSchema = z.object({
  notes: z.array(
    z.object({
      day: z.string().regex(DAY),
      from: z.string().regex(/^\d{2}:\d{2}$/),
      to: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      appliance: z.string().min(1),
      watts: z.number().int().positive().optional(),
    }),
  ),
});

function at(day: string, time: string): EpochSeconds | null {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return lisbonLocalTime(day, hour, minute);
}

function evaluate(): void {
  if (!existsSync(FOLDER)) fail('Nothing kept yet: pnpm nilm:eval fetch <day>');
  const files = readdirSync(FOLDER)
    .filter((name) => /^\d{4}-\d{2}-\d{2}_.+\.bin$/.test(name))
    .filter((name) => days.length === 0 || days.includes(name.slice(0, 10)))
    .sort();
  if (files.length === 0) fail('No kept days match.');
  const notesPath = join(FOLDER, 'notes.json');
  const notes = existsSync(notesPath)
    ? notesSchema.parse(JSON.parse(readFileSync(notesPath, 'utf8'))).notes
    : [];

  console.log(`Detector version ${DETECTOR_VERSION}\n`);
  const found: { day: string; cycles: Cycle[] }[] = [];
  for (const name of files) {
    const day = name.slice(0, 10);
    const minutes = decodeSecondsRecords(readFileSync(join(FOLDER, name)));
    const events = detectEvents(
      toSeries(minutes, startOfLisbonDay(day), startOfLisbonDay(nextDate(day))),
    );
    const cycles = pairCycles(events);
    found.push({ day, cycles });
    console.log(
      `${name}: ${minutes.length} minutes, ${events.length} steps, ${cycles.length} cycles`,
    );
    for (const group of groupCycles(cycles)) {
      const when =
        group.count === 1 ? formatLisbonTime(group.cycles[0]!.start) : `${group.count} times`;
      console.log(
        `  ${(group.statesW.length > 1 ? group.statesW.map((watts) => formatPower(watts)).join(' → ') : formatPower(group.powerW)).padStart(9)}  ${when.padEnd(9)} ${formatDuration(group.durationS).padEnd(14)} ${formatKwh(group.energyWh, 2)}`,
      );
    }
    const paired = new Set(cycles.flatMap((cycle) => [cycle.on, cycle.off]));
    const unpaired = events.filter(
      (event) => !paired.has(event) && Math.abs(event.deltaW) >= LIST_UNPAIRED_W,
    );
    if (unpaired.length > 0) {
      console.log(`  unpaired steps ≥ ${LIST_UNPAIRED_W} W:`);
      for (const event of unpaired) {
        console.log(
          `    ${formatLisbonTime(event.ts)} ${event.deltaW > 0 ? '+' : ''}${event.deltaW} W (${event.deltaVar} var, transient ${event.transientS} s${event.ramp ? ', ramp' : ''})`,
        );
      }
    }
    console.log();
  }

  if (notes.length === 0) {
    console.log('No fixtures/private/nilm/notes.json: nothing to compare with.');
    return;
  }
  let matched = 0;
  for (const note of notes) {
    const start = at(note.day, note.from);
    const end = note.to ? at(note.day, note.to) : null;
    const cycles = found.filter((item) => item.day === note.day).flatMap((item) => item.cycles);
    const best = cycles
      .filter(
        (cycle) =>
          start !== null &&
          Math.abs(cycle.start - start) <= START_SLACK_S &&
          (end === null || Math.abs(cycle.end - end) <= END_SLACK_S),
      )
      .sort(
        (a, b) =>
          Math.abs(a.powerW - (note.watts ?? a.powerW)) -
            Math.abs(b.powerW - (note.watts ?? b.powerW)) ||
          Math.abs(a.start - (start ?? 0)) - Math.abs(b.start - (start ?? 0)),
      )[0];
    const label = `${note.day} ${note.from}${note.to ? `–${note.to}` : ''} ${note.appliance}`;
    if (best) {
      matched++;
      console.log(
        `FOUND    ${label}: ${formatPower(best.powerW)} ${formatLisbonTime(best.start)}–${formatLisbonTime(best.end)} (${formatDuration(best.durationS)})`,
      );
    } else if (cycles.length === 0) {
      console.log(`NO DATA  ${label}`);
    } else {
      console.log(`MISSED   ${label}`);
    }
  }
  console.log(`\n${matched}/${notes.length} noted appliances found`);
}

if (args[0] === 'fetch') fetchDays();
else evaluate();
