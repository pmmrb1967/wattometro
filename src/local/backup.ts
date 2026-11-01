// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What protects a household kept only in this browser: when it was last copied
 * to a file, when it last changed, and the browser's persistent storage. The
 * copy's date is when the file was downloaded: the app cannot know it was kept.
 */
import type { LocalRead } from './stored';

const BACKUP_KEY = 'wattometro.local.backup-at';
const CHANGED_KEY = 'wattometro.local.changed-at';

/** Window event: the household or its copy changed. */
export const LOCAL_CHANGED = 'wattometro:local-changed';

/** A copy older than this is worth renewing, if the house changed since. */
const COPY_DUE_SECONDS = 30 * 86_400;

export interface BackupMarks {
  backupAt: number | null;
  changedAt: number | null;
}

export type LocalStatus =
  { kind: 'unreadable' | 'empty' | 'never' } | { kind: 'due' | 'fresh'; at: number };

export function localStatus(read: LocalRead, marks: BackupMarks, now: number): LocalStatus {
  if (read.kind === 'unreadable') return { kind: 'unreadable' };
  if (read.kind === 'empty') return { kind: 'empty' };
  if (read.data.quarters.length === 0 && read.data.tariffs.length === 0) return { kind: 'empty' };
  const { backupAt, changedAt } = marks;
  if (backupAt === null) return { kind: 'never' };
  const changed = changedAt !== null && changedAt > backupAt;
  return { kind: changed && now - backupAt >= COPY_DUE_SECONDS ? 'due' : 'fresh', at: backupAt };
}

function readMark(key: string): number | null {
  try {
    const value = localStorage.getItem(key);
    return value === null ? null : Number(value) || null;
  } catch {
    return null;
  }
}

function writeMark(key: string, at: number): void {
  try {
    localStorage.setItem(key, String(at));
  } catch {
    // Not remembered: the reminder then errs on the side of asking for a copy.
  }
  window.dispatchEvent(new Event(LOCAL_CHANGED));
}

export function readBackupMarks(): BackupMarks {
  return { backupAt: readMark(BACKUP_KEY), changedAt: readMark(CHANGED_KEY) };
}

export const markBackup = (at: number) => writeMark(BACKUP_KEY, at);
export const markChanged = (at: number) => writeMark(CHANGED_KEY, at);

export function clearBackupMarks(): void {
  try {
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(CHANGED_KEY);
  } catch {
    // Nothing kept to remove.
  }
}

/**
 * Asks the browser not to clear the data when space runs short; it may say no.
 * Asked once there is something to protect, and again at each opening: browsers
 * tend to agree sooner to a site in use or installed than on a first visit.
 */
export async function askPersistence(
  storage: Partial<Pick<StorageManager, 'persist' | 'persisted'>> | undefined = navigator.storage,
): Promise<void> {
  try {
    if (await storage?.persisted?.()) return;
    await storage?.persist?.();
  } catch {
    // The copy in a file remains the protection.
  }
}
