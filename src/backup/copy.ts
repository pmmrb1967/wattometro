// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Makes the household copy in the browser (docs/backup.md): reads the house
 * section by section, a page at a time (GET /v1/backup/export), writes each
 * page as a line into gzip as it arrives, and seals the result with the
 * account password (seal.ts). The file's content, once opened:
 *
 *   {"format":"wattometro-casa","version":1,"createdAt":…,"householdName":…}
 *   ["tariffs",[[…],[…]]]
 *   ["minutes",[[…],…]]
 *   …
 */
import { fetchExportPage, type Busy, type ExportPage } from '../api/backup';
import type { Failure } from '../api/client';
import { FORMAT, FORMAT_VERSION, SECTION_ORDER, type BackupHeader } from './format';
import { gzipWriter, sealGzipped } from './seal';

export type CopyResult = { ok: true; file: Uint8Array<ArrayBuffer>; rows: number } | Busy | Failure;

export async function makeCopy(
  password: string,
  householdName: string,
  onRows: (rows: number) => void,
  now = () => Math.floor(Date.now() / 1000),
): Promise<CopyResult> {
  const writer = gzipWriter();
  const header: BackupHeader = {
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt: now(),
    householdName,
  };
  await writer.write(JSON.stringify(header));
  let rows = 0;
  for (const section of SECTION_ORDER) {
    let cursor: ExportPage['next'] = null;
    do {
      const result = await fetchExportPage(section, cursor);
      if (!result.ok) {
        // What was written so far is dropped.
        await writer.finish().catch(() => null);
        return result;
      }
      const { page } = result;
      if (page.rows.length > 0) await writer.write(JSON.stringify([section, page.rows]));
      rows += page.rows.length;
      onRows(rows);
      cursor = page.next;
    } while (cursor !== null);
  }
  const zipped = await writer.finish();
  return { ok: true, file: await sealGzipped(zipped, password), rows };
}
