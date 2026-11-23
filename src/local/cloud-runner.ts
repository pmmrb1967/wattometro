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
import {
  cloudAccountLabel,
  forgetSignIn,
  linkedDrive,
  signedInDrive,
  signedInLink,
  signOutOfCloud,
} from '../cloud/cloud-drives';
import { CloudError, type CloudDrive } from '../cloud/drive';
import { cloudAvailable, type CloudProvider } from '../cloud/providers';
import { markBackup, markChanged } from './backup';
import { BACKUPS_FOLDER, decodeHouse, parseBackupName, readKeyFile } from './cloud-files';
import type { CloudReturn } from './cloud-return';
import { browserCloudLinkStore, type CloudLink, type CloudLinkStore } from './cloud-state';
import {
  connectFirst,
  disconnect,
  houseHasData,
  joinCloud,
  REMOVED_KEY,
  resetSnapshotCache,
  syncOnce,
  type LinkAccount,
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
  | {
      linked: true;
      provider: CloudProvider;
      accountLabel?: string;
      lastSyncAt?: number;
      error?: CloudLink['error'];
    };

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

/** What a cycle needs in the app: the drive, the house in IndexedDB, the local server's queue. */
export function browserSyncDeps(drive: CloudDrive): SyncDeps {
  return {
    drive,
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
  return syncOnce(browserSyncDeps(linkedDrive(link)));
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
  if (!cloudAvailable()) return () => undefined;
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
 * where no cloud service is offered.
 */
export async function cloudStatus(
  available: () => boolean = cloudAvailable,
  links: CloudLinkStore = browserCloudLinkStore,
): Promise<CloudStatus> {
  if (!available()) return { linked: false };
  const link = await links.load();
  if (!link) return { linked: false };
  const status: CloudStatus = { linked: true, provider: link.provider };
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
  const entries = await linkedDrive(link).list(BACKUPS_FOLDER);
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
  const file = await linkedDrive(link).read(`${BACKUPS_FOLDER}/${name}`);
  if (file === null) return null;
  const decoded = await decodeHouse({ keyId: link.keyId, masterKey: link.masterKey }, file.bytes);
  return decoded.kind === 'ok' ? decoded.payload.data : null;
}

const driveOf = (signIn: CloudReturn): CloudDrive =>
  signedInDrive(signIn.provider, signIn.accountId);

/**
 * What a link saved from this sign-in follows: OneDrive keeps the MSAL account;
 * Dropbox and Google Drive keep the lasting link held for this tab (no accountId).
 */
async function linkAccount(signIn: CloudReturn, drive: CloudDrive): Promise<LinkAccount> {
  const account: LinkAccount = { provider: signIn.provider };
  if (signIn.provider === 'onedrive') {
    account.id = signIn.accountId;
  } else {
    const refreshToken = signedInLink(signIn.provider, signIn.accountId);
    // This tab no longer holds the sign-in (its sessionStorage was refused or cleared).
    if (!refreshToken) throw new CloudError('needs_reconnect');
    account.refreshToken = refreshToken;
  }
  const label = await cloudAccountLabel(drive);
  if (label !== undefined) account.label = label;
  return account;
}

/** Whether the signed-in account's folder already has a house (`chave.json`). */
export async function cloudHasHouse(signIn: CloudReturn): Promise<boolean> {
  return (await readKeyFile(driveOf(signIn))) !== null;
}

/**
 * Back from "Ligar de novo": the link follows that account, and a cycle runs.
 * A sign-in to another service than the link's changes nothing.
 */
export async function relinkAccount(signIn: CloudReturn): Promise<void> {
  const before = await browserCloudLinkStore.load();
  if (!before || before.provider !== signIn.provider) return;
  const account = await linkAccount(signIn, driveOf(signIn));
  // In the cycles' lock: a cycle mid-way cannot put the old account's error back.
  const relinked = await acrossTabs(async () => {
    const link = await browserCloudLinkStore.load();
    if (!link || link.provider !== account.provider) return false;
    const next: CloudLink = { ...link };
    if (account.id !== undefined) next.accountId = account.id;
    if (account.refreshToken !== undefined) next.refreshToken = account.refreshToken;
    if (account.label !== undefined) next.accountLabel = account.label;
    delete next.error;
    return browserCloudLinkStore.save(next);
  });
  if (!relinked) return;
  forgetSignIn(signIn.provider, signIn.accountId);
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

/** The first device of a folder without a house; CloudKeyError 'exists' when it has one. */
export async function linkFirstDevice(
  signIn: CloudReturn,
  password: string,
): Promise<{ recoveryKey: string }> {
  const drive = driveOf(signIn);
  const who = await linkAccount(signIn, drive);
  const result = await acrossTabs(() => connectFirst(browserSyncDeps(drive), password, who));
  // The house keeps the link now: the copy held in this tab goes.
  forgetSignIn(signIn.provider, signIn.accountId);
  // Linked again: the removed mark goes, and the runner starts (runWhileLinked).
  clearRemovedMark();
  return result;
}

/** Another device of a folder with a house (CloudKeyError 'wrong_secret' when the secret is wrong). */
export async function joinFromCloud(
  signIn: CloudReturn,
  secret: { password: string } | { recoveryKey: string },
  mode: 'join' | 'replace',
): Promise<void> {
  const drive = driveOf(signIn);
  const who = await linkAccount(signIn, drive);
  await acrossTabs(() => joinCloud(browserSyncDeps(drive), secret, mode, who));
  forgetSignIn(signIn.provider, signIn.accountId);
  clearRemovedMark();
}

/**
 * Unlinks this browser: removes its snapshot (or, with `removeCloud`, the whole
 * house in the cloud) and forgets the sign-in here (MSAL's, for OneDrive). Without
 * `removeCloud` a drive that cannot be reached still unlinks (false: its
 * snapshot stays in the folder); with it, the error comes back and nothing here changes.
 */
export async function unlinkCloud(options: { removeCloud: boolean }): Promise<boolean> {
  // No new cycle from here; one already running ends before the lock is ours.
  current?.stop();
  let outcome: { reached: boolean; link: CloudLink | null };
  try {
    outcome = await acrossTabs(async () => {
      const link = await browserCloudLinkStore.load();
      const done = (reached: boolean) => ({ reached, link });
      // Already unlinked (another tab): no drive to reach.
      if (!link) return done(true);
      try {
        await disconnect(browserSyncDeps(linkedDrive(link)), options);
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
  // Microsoft forgets the account here; a Dropbox or Google link went with the link itself.
  if (outcome.link) {
    await signOutOfCloud(outcome.link.provider, outcome.link.accountId).catch(() => undefined);
  }
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
