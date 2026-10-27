// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Downloads the OMIE day-ahead prices for Portugal and writes
 * public/data/omie-pt.json: the last DAYS days and tomorrow, if published.
 *
 *   pnpm omie:sync [--force]
 *
 * Source: the public file repository of OMIE (docs/omie.md). Only public market
 * data: no user data involved. Days already in the file are kept; --force reads
 * every day again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { omieFileSchema, type OmieFile } from '../src/domain/omie';
import {
  QUARTER_HOUR,
  lisbonToday,
  nextDate,
  startOfMadridDay,
  type LocalDate,
} from '../src/lib/time';
import { joinDays, parseOmieDay, type OmieDay } from './omie/parse';

const OUTPUT = resolve('public', 'data', 'omie-pt.json');
/** A year and a month: the tariff simulator uses the last 365 days. */
const DAYS = 400;
/** Requests at a time: a few, to be gentle with a public site. */
const PARALLEL = 4;

const fileName = (date: LocalDate) => `marginalpdbcpt_${date.replaceAll('-', '')}.1`;
const fileUrl = (date: LocalDate) =>
  `https://www.omie.es/es/file-download?parents=marginalpdbcpt&filename=${fileName(date)}`;

async function fetchDay(date: LocalDate): Promise<OmieDay | null> {
  const response = await fetch(fileUrl(date), {
    headers: { 'User-Agent': 'wattometro-omie-sync' },
  });
  if (!response.ok) return null;
  try {
    return parseOmieDay(await response.text());
  } catch {
    return null; // Not published yet (tomorrow before ~13:00 CET), or not a price file.
  }
}

/** The days a previous file already has, as quarter hours. */
function knownDays(file: OmieFile, dates: readonly LocalDate[]): Map<LocalDate, OmieDay> {
  const days = new Map<LocalDate, OmieDay>();
  for (const date of dates) {
    const from = (startOfMadridDay(date) - file.start) / QUARTER_HOUR;
    const to = (startOfMadridDay(nextDate(date)) - file.start) / QUARTER_HOUR;
    if (from < 0 || to > file.prices.length) continue;
    const prices = file.prices.slice(from, to);
    if (prices.every((price): price is number => price !== null)) {
      days.set(date, { date, step: QUARTER_HOUR, prices });
    }
  }
  return days;
}

async function main(): Promise<void> {
  const today = lisbonToday();
  const dates: LocalDate[] = [];
  let date = today;
  for (let back = 0; back < DAYS; back++) {
    dates.unshift(date);
    date = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  }
  dates.push(nextDate(today));

  const previous =
    existsSync(OUTPUT) && !process.argv.includes('--force')
      ? omieFileSchema.safeParse(JSON.parse(readFileSync(OUTPUT, 'utf8')))
      : null;
  const days = previous?.success ? knownDays(previous.data, dates) : new Map<LocalDate, OmieDay>();
  const missing = dates.filter((day) => !days.has(day));

  const queue = [...missing];
  const failed: LocalDate[] = [];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let day = queue.shift(); day; day = queue.shift()) {
        const result = await fetchDay(day);
        if (result) days.set(day, result);
        else failed.push(day);
      }
    }),
  );

  const last = [...days.keys()].sort().at(-1);
  if (!last) throw new Error('No OMIE prices read');
  const file = joinDays([...days.values()], {
    source: fileName(last),
    fetchedAt: new Date().toISOString(),
  });
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(file)}\n`);
  console.log(
    `✔ ${days.size} days (${missing.length - failed.length} read now), up to ${last} → public/data/omie-pt.json`,
  );
  const missed = failed.filter((day) => day <= today);
  if (missed.length > 0) console.warn(`  Missing: ${missed.sort().join(' ')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
