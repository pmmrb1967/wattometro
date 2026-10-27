// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (scripts/erse-sync.ts): electricity only.
/**
 * Downloads the ERSE offers and writes public/data/erse-offers.json.
 *
 *   pnpm erse:sync [--force]
 *
 * Source: the CSV ZIP linked from the ERSE price simulator, found through
 * https://simuladorprecos.erse.pt/config/Settings.json → csvPath
 * (docs/erse-data.md). Only public market data: no user data involved.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { dataDateFromName, decodeCsv, isUpToDate, normalize, parseCsv } from './erse/normalize';

const SETTINGS_URL = 'https://simuladorprecos.erse.pt/config/Settings.json';
const OUTPUT = resolve('public', 'data', 'erse-offers.json');

const settingsSchema = z.object({ csvPath: z.string().url() });

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { 'User-Agent': 'wattometro-erse-sync' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

async function main(): Promise<void> {
  const settings = settingsSchema.parse(await (await fetchOk(SETTINGS_URL)).json());
  const zipUrl = encodeURI(settings.csvPath);
  const zipName = decodeURIComponent(zipUrl.split('/').pop() ?? '');
  const dataDate = dataDateFromName(zipName);
  if (!dataDate) throw new Error(`Unexpected ERSE file name: ${zipName}`);

  if (existsSync(OUTPUT)) {
    const current = JSON.parse(readFileSync(OUTPUT, 'utf8')) as {
      source?: string;
      schemaVersion?: number;
    };
    // --force: rewrite it anyway (after a change in how it is read).
    if (isUpToDate(current, zipName) && !process.argv.includes('--force')) {
      console.log(`Already up to date (${zipName}).`);
      return;
    }
  }

  const files = unzipSync(new Uint8Array(await (await fetchOk(zipUrl)).arrayBuffer()));
  // Paths in the ZIP use backslashes ("csv\\CondComerciais.csv").
  const byName = new Map(
    Object.entries(files).map(([path, data]) => [path.split(/[\\/]/).pop() ?? path, data]),
  );
  const conditions = byName.get('CondComerciais.csv');
  const prices = byName.get('Precos_ELEGN.csv');
  if (!conditions || !prices)
    throw new Error(`ZIP without the expected CSV files: ${[...byName.keys()].join(', ')}`);

  const file = normalize(parseCsv(decodeCsv(conditions)), parseCsv(decodeCsv(prices)), {
    source: zipName,
    dataDate,
    fetchedAt: new Date().toISOString(),
  });
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(file)}\n`);
  const powers = new Set(file.offers.flatMap((offer) => Object.keys(offer.prices)));
  console.log(
    `✔ ${file.offers.length} electricity offers from ${zipName} → public/data/erse-offers.json`,
  );
  console.log(`  Contracted powers (kVA): ${[...powers].sort((a, b) => +a - +b).join(' ')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
