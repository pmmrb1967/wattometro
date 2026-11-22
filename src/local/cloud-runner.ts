// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * When the sync cycle of the local mode runs (docs/superpowers/specs/
 * 2026-11-22-local-cloud-sync-design.md, "Quando corre"), and what the pages
 * ask of the cloud folder: its status, its backups, putting a house back.
 *
 * A cycle runs when the runner starts, 10 s after the last local write (a burst
 * of writes makes one cycle), every 5 minutes while the app is open, and when
 * the connection comes back; one at a time across the tabs (Web Locks). After
 * `throttled` nothing runs until the drive's `Retry-After` has passed. Each
 * cycle's result goes to the window as CLOUD_CHANGED.
 */
import { OneDrive } from '../cloud/onedrive';
import { oneDriveAccountLabel, oneDriveToken, signOutOfOneDrive } from '../cloud/onedrive-auth';
import { oneDriveAvailable } from '../cloud/providers';
import { markBackup, markChanged } from './backup';
import { BACKUPS_FOLDER, decodeHouse, parseBackupName, readKeyFile } from './cloud-files';
import { browserCloudLinkStore, type CloudLink, type CloudLinkStore } from './cloud-state';
import {
  connectFirst,
  disconnect,
  houseHasData,
  joinCloud,
  REMOVED_KEY,
  resetSnapshotCache,
  syncOnce,
  type SyncDeps,
  type SyncResult,
} from './cloud-sync';
import type { LocalData } from './data';
import { newGeneration, SECTIONS, type Section, type SyncMeta } from './meta';
import { localExclusive, reloadLocal } from './server';
import { browserStore, type LocalStore } from './store';
import { notifyLocalWrite, onLocalWrite } from './write-hook';

/** Window event (a CustomEvent with the SyncResult, or null when the link changed): the cloud status changed. */
export const CLOUD_CHANGED = 'wattometro:cloud-changed';

const LOCK = 'wattometro-cloud-sync';
const AFTER_WRITE_MS = 10_000;
const EVERY_MS = 300_000;
/** A cloud that has not synced for this long no longer counts as a copy. */
const CLOUD_STALE_S = 30 * 86_400;

const NOTHING: SyncResult = { pulled: 0, pushed: false, backup: false };

export type CloudStatus =
  | { linked: false }
  | { linked: true; accountLabel?: string; lastSyncAt?: number; error?: CloudLink['error'] };

const seconds = (ms: number) => Math.floor(ms / 1000);

function emit(result: SyncResult | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOUD_CHANGED, { detail: result }));
}

/** Across the tabs of this browser, where it has Web Locks (as server.ts). */
function acrossTabs<T>(task: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  return locks ? (locks.request(LOCK, task) as Promise<T>) : task();
}

/** The OneDrive of the linked account (the last signed-in one when not given). */
function oneDriveFor(accountId?: string): OneDrive {
  return new OneDrive(() => oneDriveToken(accountId), {
    label: () => oneDriveAccountLabel(accountId),
  });
}

/** What a cycle needs in the app: OneDrive, the house in IndexedDB, the local server's queue. */
export function browserSyncDeps(accountId?: string): SyncDeps {
  return {
    drive: oneDriveFor(accountId),
    house: browserStore,
    links: browserCloudLinkStore,
    exclusive: localExclusive,
    now: () => Date.now() / 1000,
    onHouseChanged: () => {
      // Forgets what the local server read; the banner and the other tabs read it again.
      reloadLocal();
      markChanged(seconds(Date.now()));
    },
  };
}

async function browserRun(): Promise<SyncResult> {
  const link = await browserCloudLinkStore.load();
  if (!link) return NOTHING;
  return syncOnce(browserSyncDeps(link.accountId));
}

interface Runner {
  write(): void;
  request(): void;
  stop(): void;
}

let current: Runner | null = null;

/** The local server kept a change: a cycle in 10 s, unless another write comes first. */
export { notifyLocalWrite };

/** "Sincronizar agora": a cycle as soon as possible (after any Retry-After). */
export function requestSync(): void {
  current?.request();
}

export function startCloudRunner(
  options: {
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
    /** Epoch milliseconds. */
    now?: () => number;
    /** One cycle; syncOnce on the browser's link when not given. */
    run?: () => Promise<SyncResult>;
  } = {},
): () => void {
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const now = options.now ?? (() => Date.now());
  const run = options.run ?? browserRun;

  let stopped = false;
  let running = false;
  let again = false;
  /** No cycle before this (epoch ms), after `throttled`. */
  let blockedUntil = 0;
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;

  /** The next cycle without a write: every 5 minutes, or when the drive allows again. */
  function scheduleNext(ms: number): void {
    if (nextTimer !== undefined) clearTimer(nextTimer);
    nextTimer = setTimer(() => {
      nextTimer = undefined;
      request();
    }, ms);
  }

  async function cycle(): Promise<void> {
    let result: SyncResult = NOTHING;
    try {
      result = await acrossTabs(run);
    } catch {
      // Not a drive error (those come back in the result): tried again on the next turn.
    }
    if (stopped) return;
    if (result.error === 'throttled') {
      blockedUntil = now() + (result.retryAfterSeconds ?? 60) * 1000;
    }
    if (result.backup) markBackup(seconds(now()));
    emit(result);
  }

  function request(): void {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    const wait = blockedUntil - now();
    if (wait > 0) {
      scheduleNext(wait);
      return;
    }
    running = true;
    void cycle().finally(() => {
      running = false;
      if (stopped) return;
      const blocked = blockedUntil - now();
      if (again && blocked <= 0) {
        again = false;
        request();
        return;
      }
      again = false;
      scheduleNext(blocked > 0 ? blocked : EVERY_MS);
    });
  }

  function write(): void {
    if (stopped) return;
    if (writeTimer !== undefined) clearTimer(writeTimer);
    writeTimer = setTimer(() => {
      writeTimer = undefined;
      request();
    }, AFTER_WRITE_MS);
  }

  const online = () => request();
  function stop(): void {
    stopped = true;
    if (writeTimer !== undefined) clearTimer(writeTimer);
    if (nextTimer !== undefined) clearTimer(nextTimer);
    if (typeof window !== 'undefined') window.removeEventListener('online', online);
    if (current === runner) {
      current = null;
      onLocalWrite(null);
    }
  }
  const runner: Runner = { write, request, stop };
  current = runner;
  onLocalWrite(write);
  if (typeof window !== 'undefined') window.addEventListener('online', online);
  request();

  return stop;
}

/**
 * The runner while this browser is linked: started when a link exists, stopped
 * when it goes (disconnected, or the cloud house removed). For the local mode only.
 */
export function runWhileLinked(): () => void {
  if (!oneDriveAvailable()) return () => undefined;
  let active = true;
  let stop: (() => void) | null = null;
  const check = async () => {
    const status = await cloudStatus();
    if (!active) return;
    // A runner stopped by unlinkCloud (current is then null) starts again while still linked.
    if (status.linked && (!stop || current === null)) {
      stop?.();
      stop = startCloudRunner();
    } else if (!status.linked && stop) {
      stop();
      stop = null;
    }
  };
  const listener = () => void check();
  listener();
  window.addEventListener(CLOUD_CHANGED, listener);
  return () => {
    active = false;
    window.removeEventListener(CLOUD_CHANGED, listener);
    stop?.();
  };
}

/**
 * The link of this browser; never linked (and its IndexedDB never opened)
 * where OneDrive is not offered.
 */
export async function cloudStatus(
  available: () => boolean = oneDriveAvailable,
  links: CloudLinkStore = browserCloudLinkStore,
): Promise<CloudStatus> {
  if (!available()) return { linked: false };
  const link = await links.load();
  if (!link) return { linked: false };
  const status: CloudStatus = { linked: true };
  if (link.accountLabel !== undefined) status.accountLabel = link.accountLabel;
  if (link.lastSyncAt !== undefined) status.lastSyncAt = link.lastSyncAt;
  if (link.error !== undefined) status.error = link.error;
  return status;
}

/** Errors that pass on their own: the link still counts while its last sync is recent. */
const TRANSIENT: readonly (CloudLink['error'] | undefined)[] = [undefined, 'offline', 'throttled'];

/** The cloud counts as a copy: linked, without a lasting error, synced in the last 30 days. */
export function cloudWorking(status: CloudStatus, now: number): boolean {
  return (
    status.linked &&
    TRANSIENT.includes(status.error) &&
    status.lastSyncAt !== undefined &&
    now - status.lastSyncAt < CLOUD_STALE_S
  );
}

/** The meta of a house put back: every section changed now, and a new quarters generation. */
export function restoredMeta(now: number): SyncMeta {
  const stamps = Object.fromEntries(SECTIONS.map((section) => [section, now])) as Record<
    Section,
    number
  >;
  return { stamps, quartersGeneration: newGeneration(now) };
}

/**
 * "Repor cópia" (a file or a cloud backup): the house becomes `data` on every
 * device, since every section and its quarters are newer than theirs. Counts as a copy.
 */
export async function restoreHouse(data: LocalData): Promise<boolean> {
  const now = seconds(Date.now());
  const kept = await localExclusive(() => browserStore.save(data, restoredMeta(now)));
  if (!kept) return false;
  reloadLocal();
  markBackup(now);
  requestSync();
  return true;
}

/** The app's dated backups in the cloud folder, the newest first. */
export async function listCloudBackups(): Promise<{ name: string; day: string; size: number }[]> {
  const link = await browserCloudLinkStore.load();
  if (!link) return [];
  const entries = await oneDriveFor(link.accountId).list(BACKUPS_FOLDER);
  return entries
    .flatMap((entry) => {
      const parsed = parseBackupName(entry.name);
      return parsed ? [{ name: entry.name, day: parsed.day, size: entry.size }] : [];
    })
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** A backup's house, or null when it is gone or cannot be read with this key. */
export async function readCloudBackup(name: string): Promise<LocalData | null> {
  const link = await browserCloudLinkStore.load();
  if (!link || parseBackupName(name) === null) return null;
  const file = await oneDriveFor(link.accountId).read(`${BACKUPS_FOLDER}/${name}`);
  if (file === null) return null;
  const decoded = await decodeHouse({ keyId: link.keyId, masterKey: link.masterKey }, file.bytes);
  return decoded.kind === 'ok' ? decoded.payload.data : null;
}

/** Whether the signed-in account's folder already has a house (`chave.json`). */
export async function cloudHasHouse(accountId: string): Promise<boolean> {
  return (await readKeyFile(oneDriveFor(accountId))) !== null;
}

/** Back from "Ligar de novo ao OneDrive": the link follows that account, and a cycle runs. */
export async function relinkAccount(accountId: string): Promise<void> {
  const label = await oneDriveAccountLabel(accountId).catch(() => undefined);
  // In the cycles' lock: a cycle mid-way cannot put the old account's error back.
  const relinked = await acrossTabs(async () => {
    const link = await browserCloudLinkStore.load();
    if (!link) return false;
    const next: CloudLink = { ...link, accountId };
    if (label !== undefined) next.accountLabel = label;
    delete next.error;
    await browserCloudLinkStore.save(next);
    return true;
  });
  if (!relinked) return;
  emit(null);
  requestSync();
}

/** When this device found the cloud house deleted or replaced (epoch s), until linked again or closed. */
export function removedMark(): number | null {
  try {
    const value = globalThis.localStorage?.getItem(REMOVED_KEY);
    return value ? Number(value) || null : null;
  } catch {
    return null;
  }
}

export function clearRemovedMark(): void {
  try {
    globalThis.localStorage?.removeItem(REMOVED_KEY);
  } catch {
    // Nothing kept to remove.
  }
  emit(null);
}

async function account(accountId: string): Promise<{ id: string; label?: string }> {
  const label = await oneDriveAccountLabel(accountId).catch(() => undefined);
  return label === undefined ? { id: accountId } : { id: accountId, label };
}

/** The first device of a folder without a house; CloudKeyError 'exists' when it has one. */
export async function linkFirstDevice(
  accountId: string,
  password: string,
): Promise<{ recoveryKey: string }> {
  const who = await account(accountId);
  const result = await acrossTabs(() => connectFirst(browserSyncDeps(accountId), password, who));
  // Linked again: the removed mark goes, and the runner starts (runWhileLinked).
  clearRemovedMark();
  return result;
}

/** Another device of a folder with a house (CloudKeyError 'wrong_secret' when the secret is wrong). */
export async function joinFromCloud(
  accountId: string,
  secret: { password: string } | { recoveryKey: string },
  mode: 'join' | 'replace',
): Promise<void> {
  const who = await account(accountId);
  await acrossTabs(() => joinCloud(browserSyncDeps(accountId), secret, mode, who));
  clearRemovedMark();
}

/**
 * Unlinks this browser: removes its snapshot (or, with `removeCloud`, the whole
 * house in the cloud) and forgets the Microsoft sign-in here. Without
 * `removeCloud` a drive that cannot be reached still unlinks (false: its
 * snapshot stays in the folder); with it, the error comes back and nothing here changes.
 */
export async function unlinkCloud(options: { removeCloud: boolean }): Promise<boolean> {
  // No new cycle from here; one already running ends before the lock is ours.
  current?.stop();
  let outcome: { reached: boolean; accountId?: string };
  try {
    outcome = await acrossTabs(async () => {
      const link = await browserCloudLinkStore.load();
      const accountId = link?.accountId;
      const done = (reached: boolean) =>
        accountId === undefined ? { reached } : { reached, accountId };
      try {
        await disconnect(browserSyncDeps(accountId), options);
      } catch (error) {
        if (options.removeCloud) throw error;
        await browserCloudLinkStore.clear();
        resetSnapshotCache();
        return done(false);
      }
      return done(true);
    });
  } catch (error) {
    // Still linked: runWhileLinked starts the runner again.
    emit(null);
    throw error;
  }
  await signOutOfOneDrive(outcome.accountId).catch(() => undefined);
  emit(null);
  return outcome.reached;
}

/**
 * Whether the house in this browser has anything to keep, in any section
 * (joining asks what to do with it). One that cannot be read counts as kept.
 */
export async function localHouseHasData(store: LocalStore = browserStore): Promise<boolean> {
  const read = await store.load();
  if (read.kind === 'empty') return false;
  return read.kind === 'unreadable' || houseHasData(read.data);
}

/** The link changed: the banner and the runner look again. */
export const announceCloudChange = (): void => emit(null);
