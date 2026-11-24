// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Puts a household copy back by joining (docs/backup.md): its rows go to the
 * server a few hundred at a time (POST /v1/backup/restore), where what the
 * house already has stays. On the free plan D1 writes 100 000 rows a day, so a
 * year of minutes takes days: the server says when to stop for the day, and
 * this browser keeps the sealed file, its key (non-extractable) and how far it
 * went (kept.ts), and goes on whenever the app opens after that.
 */
import { sendRestoreRows } from '../api/backup';
import {
  headerSchema,
  lineSchema,
  MAX_RESTORE_ROWS,
  ROW_SCHEMAS,
  type BackupHeader,
  type Row,
  type Section,
} from './format';
import { readKept, removeKept, writeKept } from './kept';
import { gzippedLines, openGzipped, readSealed, SealError, sealKey } from './seal';

/** Largest body sent at once (the server takes up to 1 MB). */
const MAX_CHUNK_BYTES = 400_000;

export interface OpenedCopy {
  header: BackupHeader;
  totals: Partial<Record<Section, number>>;
  total: number;
  file: Uint8Array<ArrayBuffer>;
  key: CryptoKey;
}

export type OpenFailure = 'notACopy' | 'unknownVersion' | 'wrongPassword' | 'badContent';

/** Opens the file with the password and checks every line (nothing is sent yet). */
export async function openCopy(
  file: Uint8Array<ArrayBuffer>,
  password: string,
): Promise<{ ok: true; copy: OpenedCopy } | { ok: false; reason: OpenFailure }> {
  try {
    const sealed = readSealed(file);
    const key = await sealKey(password, sealed.salt, sealed.iterations);
    const zipped = await openGzipped(sealed, key);
    let header: BackupHeader | null = null;
    const totals: Partial<Record<Section, number>> = {};
    let total = 0;
    for await (const text of gzippedLines(zipped)) {
      const json: unknown = JSON.parse(text);
      if (header === null) {
        header = headerSchema.parse(json);
        continue;
      }
      const [section, rows] = lineSchema.parse(json);
      const checked = ROW_SCHEMAS[section].array().safeParse(rows);
      if (!checked.success) return { ok: false, reason: 'badContent' };
      totals[section] = (totals[section] ?? 0) + rows.length;
      total += rows.length;
    }
    if (header === null) return { ok: false, reason: 'badContent' };
    return { ok: true, copy: { header, totals, total, file, key } };
  } catch (error) {
    return { ok: false, reason: error instanceof SealError ? error.reason : 'badContent' };
  }
}

/** How far a restore went; kept until it ends or is cancelled. */
export interface RestoreProgress {
  householdId: string;
  createdAt: number;
  householdName: string;
  total: number;
  /** Next line of the file to send (0 is the header) and the row within it. */
  line: number;
  row: number;
  /** Rows sent, and those the house did not have yet. */
  done: number;
  written: number;
  /** Epoch seconds: the server's day was full; go on from then. */
  waitUntil: number | null;
  /** The server refused a part of the file: it will not take it later either. */
  refused?: true;
  /** All sent (the file is no longer kept); shown until dismissed. */
  finished?: true;
}

interface RestoreFile {
  file: Uint8Array<ArrayBuffer>;
  key: CryptoKey;
}

/** Sent on window as each part goes, and at the end (the Settings section listens). */
export const RESTORE_EVENT = 'wattometro:restore';

const announce = () => window.dispatchEvent(new Event(RESTORE_EVENT));

export const restoreProgress = () => readKept<RestoreProgress>('restoreProgress');

/** Keeps the copy and starts; false when the browser does not keep it. */
export async function startRestore(copy: OpenedCopy, householdId: string): Promise<boolean> {
  const progress: RestoreProgress = {
    householdId,
    createdAt: copy.header.createdAt,
    householdName: copy.header.householdName,
    total: copy.total,
    line: 1,
    row: 0,
    done: 0,
    written: 0,
    waitUntil: null,
  };
  const kept =
    (await writeKept('restoreFile', { file: copy.file, key: copy.key } satisfies RestoreFile)) &&
    (await writeKept('restoreProgress', progress));
  if (!kept) await removeKept('restoreFile', 'restoreProgress');
  announce();
  return kept;
}

/** Cancels a restore, or dismisses one that ended. */
export async function cancelRestore(): Promise<void> {
  await removeKept('restoreFile', 'restoreProgress');
  announce();
}

/** The rows of a line in parts the server takes at once. */
export function chunks(rows: readonly Row[], from: number): Row[][] {
  const parts: Row[][] = [];
  let part: Row[] = [];
  let bytes = 0;
  for (const row of rows.slice(from)) {
    const size = JSON.stringify(row).length + 1;
    if (part.length > 0 && (part.length >= MAX_RESTORE_ROWS || bytes + size > MAX_CHUNK_BYTES)) {
      parts.push(part);
      part = [];
      bytes = 0;
    }
    part.push(row);
    bytes += size;
  }
  if (part.length > 0) parts.push(part);
  return parts;
}

export type RestoreOutcome = 'done' | 'busy' | 'stopped' | 'refused' | 'none';

let running: Promise<RestoreOutcome> | null = null;

/** Goes on with the kept restore of this household; one at a time in this tab. */
export function runRestore(householdId: string): Promise<RestoreOutcome> {
  running ??= run(householdId).finally(() => {
    running = null;
  });
  return running;
}

/** On opening the app: goes on if a restore is kept and its wait is over. */
export async function resumeRestore(householdId: string, now: number): Promise<void> {
  const progress = await restoreProgress();
  if (!progress || progress.householdId !== householdId) return;
  if (progress.refused || progress.finished) return;
  if (progress.waitUntil !== null && now < progress.waitUntil) return;
  await runRestore(householdId);
}

async function run(householdId: string): Promise<RestoreOutcome> {
  const progress = await restoreProgress();
  const kept = await readKept<RestoreFile>('restoreFile');
  if (!progress || !kept || progress.householdId !== householdId) return 'none';
  if (progress.refused || progress.finished) return 'none';
  let zipped: Uint8Array<ArrayBuffer>;
  try {
    zipped = await openGzipped(readSealed(kept.file), kept.key);
  } catch {
    await cancelRestore();
    return 'none';
  }
  const save = async (change: Partial<RestoreProgress>) => {
    Object.assign(progress, change);
    await writeKept('restoreProgress', progress);
    announce();
  };
  await save({ waitUntil: null });
  let line = 0;
  for await (const text of gzippedLines(zipped)) {
    if (line < progress.line) {
      line += 1;
      continue;
    }
    const [section, rows] = lineSchema.parse(JSON.parse(text));
    for (const part of chunks(rows as Row[], progress.row)) {
      const result = await sendRestoreRows(section, part);
      if (!result.ok) {
        if (result.reason === 'busy') {
          await save({ waitUntil: result.retryAt });
          return 'busy';
        }
        if (result.reason === 'invalid') {
          await save({ refused: true });
          return 'refused';
        }
        return 'stopped';
      }
      await save({
        row: progress.row + part.length,
        done: progress.done + part.length,
        written: progress.written + result.written,
      });
    }
    line += 1;
    await save({ line, row: 0 });
  }
  await removeKept('restoreFile');
  await save({ finished: true });
  return 'done';
}
