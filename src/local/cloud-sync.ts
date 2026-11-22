// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sync cycle of the local mode through the user's cloud folder
 * (docs/superpowers/specs/2026-11-22-local-cloud-sync-design.md: "Sincronizar",
 * "Ligar", "Aparelho novo", "Repor e apagar", "Cópias automáticas").
 *
 * Each device writes only its own snapshot (`casas/<deviceId>.bin`), reads the
 * others and merges them into the house of this browser. Nothing is written
 * when the folder's key is gone or another, when the house here cannot be read,
 * or when a snapshot comes from a newer app. Errors of the drive are kept on the
 * link and returned; the house here keeps every change until the next cycle.
 */
import { CloudError, type CloudDrive } from '../cloud/drive';
import { UNKNOWN_INSTALLATION } from '../domain/installation';
import {
  BACKUPS_FOLDER,
  createKeyFile,
  decodeHouse,
  encodeHouse,
  HOUSES_FOLDER,
  housePath,
  KEY_FILE,
  backupName,
  parseBackupName,
  readKeyFile,
  unlockKeyFile,
  type CloudKey,
  type HousePayload,
} from './cloud-files';
import type { CloudLink, CloudLinkStore } from './cloud-state';
import { emptyLocalData, LOCAL_VERSION, type LocalData } from './data';
import { mergeHouses, newestGeneration, type HouseSnapshot } from './merge';
import { emptyMeta, SECTIONS, sectionValue, type Section, type SyncMeta } from './meta';
import type { LocalStore } from './store';

export interface SyncDeps {
  drive: CloudDrive;
  house: LocalStore;
  links: CloudLinkStore;
  /** The write queue and lock of the local server (localExclusive). */
  exclusive: <T>(task: () => Promise<T>) => Promise<T>;
  /** Epoch seconds. */
  now: () => number;
  /** The house here was replaced by a merge: the page reads it again. */
  onHouseChanged: () => void;
}

export interface SyncResult {
  /** Snapshots of other devices read (changed since the last cycle). */
  pulled: number;
  pushed: boolean;
  backup: boolean;
  error?: CloudLink['error'];
  /** With `throttled`: how long the drive asked to wait. */
  retryAfterSeconds?: number;
}

/**
 * Why joining or connecting stopped before linking anything; `no_cloud_house`:
 * "Ficar com a da cloud" on a folder without a house that can be read.
 */
export type CloudSyncErrorCode = 'unreadable_house' | 'newer_app' | 'no_cloud_house';

export class CloudSyncError extends Error {
  readonly code: CloudSyncErrorCode;
  constructor(code: CloudSyncErrorCode) {
    super(code);
    this.name = 'CloudSyncError';
    this.code = code;
  }
}

/** localStorage: when this device found the cloud house deleted or replaced (the banner reads it). */
export const REMOVED_KEY = 'wattometro.cloud.removed';

const BACKUP_EVERY_S = 7 * 86_400;
const BACKUPS_KEPT = 8;

/** The snapshots already decrypted, by path; only those whose etag changed are read again. */
const snapshotCache = new Map<string, { etag: string; keyId: string; payload: HousePayload }>();

export function resetSnapshotCache(): void {
  snapshotCache.clear();
}

const utcDay = (at: number): string => new Date(at * 1000).toISOString().slice(0, 10);
const dayStart = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 1000;

/** The latest change the house holds: the largest stamp, or the start of its quarters generation. */
function newestStamp(meta: SyncMeta): number {
  return Math.max(meta.quartersGeneration.at, ...SECTIONS.map((section) => meta.stamps[section]));
}

/** SHA-256 (hex) of the house as pushed: a new snapshot is sent whenever this changes. */
async function houseHash(house: { data: LocalData; meta: SyncMeta }): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ data: house.data, meta: house.meta })),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The section holds something to keep (the installation: anything but unknown). */
export function hasData(data: LocalData, section: Section): boolean {
  switch (section) {
    case 'quarters':
      return data.quarters.length > 0;
    case 'tariffs':
      return data.tariffs.length > 0;
    case 'installation':
      return JSON.stringify(data.installation) !== JSON.stringify(UNKNOWN_INSTALLATION);
    case 'equipment':
      return data.equipment.length > 0 || data.alwaysOn.length > 0;
    default:
      return data[section] !== null;
  }
}

/** Any section holds something to keep. */
export function houseHasData(data: LocalData): boolean {
  return SECTIONS.some((section) => hasData(data, section));
}

/** Section by section, so the order of the keys in the stored object does not matter. */
function sameHouse(
  a: { data: LocalData; meta: SyncMeta },
  b: { data: LocalData; meta: SyncMeta },
): boolean {
  if (a.data.version !== b.data.version) return false;
  if (
    a.meta.quartersGeneration.id !== b.meta.quartersGeneration.id ||
    a.meta.quartersGeneration.at !== b.meta.quartersGeneration.at
  ) {
    return false;
  }
  return SECTIONS.every(
    (section) =>
      a.meta.stamps[section] === b.meta.stamps[section] &&
      JSON.stringify(sectionValue(a.data, section)) ===
        JSON.stringify(sectionValue(b.data, section)),
  );
}

function markRemoved(at: number): void {
  try {
    globalThis.localStorage?.setItem(REMOVED_KEY, String(at));
  } catch {
    // Not remembered: the result of the cycle still says it.
  }
}

interface Snapshots {
  theirs: HouseSnapshot[];
  /** How many were read and decrypted (the others came from the cache). */
  read: number;
  /** This device's own snapshot is in the folder. */
  mineListed: boolean;
  unreadable: boolean;
  newer: boolean;
}

/** The snapshots of the other devices; those of another key are skipped without decrypting. */
async function readSnapshots(drive: CloudDrive, key: CloudKey, mine?: string): Promise<Snapshots> {
  const result: Snapshots = {
    theirs: [],
    read: 0,
    mineListed: false,
    unreadable: false,
    newer: false,
  };
  for (const entry of await drive.list(HOUSES_FOLDER)) {
    if (!entry.name.endsWith('.bin')) continue;
    const path = `${HOUSES_FOLDER}/${entry.name}`;
    if (mine !== undefined && path === housePath(mine)) {
      result.mineListed = true;
      continue;
    }
    const cached = snapshotCache.get(path);
    if (cached && cached.etag === entry.etag && cached.keyId === key.keyId) {
      result.theirs.push(cached.payload);
      continue;
    }
    snapshotCache.delete(path);
    const file = await drive.read(path);
    if (file === null) continue;
    result.read += 1;
    const decoded = await decodeHouse(key, file.bytes);
    if (decoded.kind === 'ok') {
      snapshotCache.set(path, { etag: file.etag, keyId: key.keyId, payload: decoded.payload });
      result.theirs.push(decoded.payload);
    } else if (decoded.kind === 'newer') {
      result.newer = true;
    } else if (decoded.kind === 'unreadable') {
      result.unreadable = true;
    }
  }
  return result;
}

function payloadOf(deviceId: string, house: { data: LocalData; meta: SyncMeta }, now: number) {
  return { version: LOCAL_VERSION, deviceId, writtenAt: now, data: house.data, meta: house.meta };
}

/** A dated copy when the newest one (of any device) is a week old and the house changed since. */
async function backupIfDue(
  drive: CloudDrive,
  key: CloudKey,
  deviceId: string,
  house: { data: LocalData; meta: SyncMeta },
  now: number,
): Promise<boolean> {
  const names = (await drive.list(BACKUPS_FOLDER))
    .map((entry) => entry.name)
    .filter((name) => parseBackupName(name) !== null)
    .sort();
  // Fixed-width days first in the name: the last one by name is the newest.
  const newest = names.at(-1);
  const newestDay = newest === undefined ? undefined : parseBackupName(newest)?.day;
  const since = newestDay === undefined ? null : dayStart(newestDay);
  const due =
    since === null
      ? newestStamp(house.meta) > 0
      : now - since >= BACKUP_EVERY_S && newestStamp(house.meta) > since;
  let written = false;
  if (due) {
    const name = backupName(utcDay(now), deviceId);
    await drive.write(
      `${BACKUPS_FOLDER}/${name}`,
      await encodeHouse(key, payloadOf(deviceId, house, now)),
    );
    if (!names.includes(name)) names.push(name);
    names.sort();
    written = true;
  }
  for (const name of names.slice(0, Math.max(0, names.length - BACKUPS_KEPT))) {
    await drive.remove(`${BACKUPS_FOLDER}/${name}`);
  }
  return written;
}

/**
 * The link is still the one the cycle started with: not removed ("Desligar",
 * another tab) nor followed to another account or folder meanwhile.
 */
async function sameLink(links: CloudLinkStore, link: CloudLink): Promise<boolean> {
  const latest = await links.load();
  return (
    latest !== null &&
    latest.deviceId === link.deviceId &&
    latest.keyId === link.keyId &&
    latest.accountId === link.accountId
  );
}

export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const { drive, house, links } = deps;
  const result: SyncResult = { pulled: 0, pushed: false, backup: false };
  const link = await links.load();
  if (!link) return result;
  const next: CloudLink = { ...link };
  const now = Math.floor(deps.now());
  const key: CloudKey = { keyId: link.keyId, masterKey: link.masterKey };
  /** What the cycle learnt goes on the link only while it is still this one. */
  const saveLink = async (): Promise<void> => {
    if (await sameLink(links, link)) await links.save(next);
  };

  try {
    // 0. The folder's key: gone or another means the cloud house was deleted or replaced.
    const keyFile = await readKeyFile(drive);
    if (keyFile === null || keyFile.keyId !== link.keyId) {
      await links.clear();
      resetSnapshotCache();
      markRemoved(now);
      return { ...result, error: 'removed' };
    }

    // 1. A house that cannot be read is never written over (its banner already says so).
    if ((await house.load()).kind === 'unreadable') return result;

    // 2. The other devices' snapshots.
    const snapshots = await readSnapshots(drive, key, link.deviceId);
    result.pulled = snapshots.read;
    if (snapshots.newer) {
      next.error = 'newer_app';
      await saveLink();
      return { ...result, error: 'newer_app' };
    }

    // 3. Merged from what is kept now, in the local server's write queue.
    const merged = await deps.exclusive(async () => {
      const current = await house.load();
      if (current.kind === 'unreadable') return null;
      const mine = {
        deviceId: link.deviceId,
        data: current.kind === 'ok' ? current.data : emptyLocalData(),
        meta: await house.loadMeta(),
      };
      const joined = mergeHouses(mine, snapshots.theirs, now);
      const changed = !sameHouse(mine, joined) && (await house.save(joined.data, joined.meta));
      return { joined, changed };
    });
    if (merged === null) return result;
    if (merged.changed) deps.onHouseChanged();

    // 4. This device's snapshot, when the house changed since the last one sent;
    // nothing more goes to the cloud once this browser was unlinked meanwhile.
    if (!(await sameLink(links, link))) return result;
    const hash = await houseHash(merged.joined);
    if (!snapshots.mineListed || hash !== link.lastPushedHash) {
      await drive.write(
        housePath(link.deviceId),
        await encodeHouse(key, payloadOf(link.deviceId, merged.joined, now)),
      );
      next.lastPushedHash = hash;
      result.pushed = true;
    }

    // 5. The shared backup calendar.
    if (!(await sameLink(links, link))) return result;
    result.backup = await backupIfDue(drive, key, link.deviceId, merged.joined, now);

    next.lastSyncAt = now;
    if (snapshots.unreadable) {
      next.error = 'unreadable_device';
      result.error = 'unreadable_device';
    } else {
      delete next.error;
    }
    await saveLink();
    return result;
  } catch (error) {
    if (!(error instanceof CloudError)) throw error;
    next.error = error.code;
    await saveLink();
    const failed: SyncResult = { ...result, error: error.code };
    if (error.retryAfterSeconds !== undefined) failed.retryAfterSeconds = error.retryAfterSeconds;
    return failed;
  }
}

function newLink(key: CloudKey, account: { id?: string; label?: string }): CloudLink {
  const link: CloudLink = {
    provider: 'onedrive',
    deviceId: crypto.randomUUID(),
    keyId: key.keyId,
    masterKey: key.masterKey,
  };
  if (account.id !== undefined) link.accountId = account.id;
  if (account.label !== undefined) link.accountLabel = account.label;
  return link;
}

/** The house here, or the reason it cannot take part. */
async function readableHouse(store: LocalStore): Promise<{ data: LocalData; meta: SyncMeta }> {
  const read = await store.load();
  if (read.kind === 'unreadable') throw new CloudSyncError('unreadable_house');
  return {
    data: read.kind === 'ok' ? read.data : emptyLocalData(),
    meta: read.kind === 'ok' ? await store.loadMeta() : emptyMeta(),
  };
}

/**
 * The first device: creates `chave.json` (never over an existing one: CloudKeyError
 * 'exists'), stamps `now` on the sections with data that were never stamped (a
 * migrated house), so an empty house linked later does not win, and runs a cycle.
 */
export async function connectFirst(
  deps: SyncDeps,
  password: string,
  account: { id?: string; label?: string },
  iterations?: number,
): Promise<{ recoveryKey: string }> {
  await readableHouse(deps.house);
  const created = await createKeyFile(deps.drive, password, iterations);
  const now = Math.floor(deps.now());
  await deps.exclusive(async () => {
    const { data, meta } = await readableHouse(deps.house);
    const stamps = { ...meta.stamps };
    let changed = false;
    for (const section of SECTIONS) {
      if (stamps[section] === 0 && hasData(data, section)) {
        stamps[section] = now;
        changed = true;
      }
    }
    if (changed) await deps.house.save(data, { ...meta, stamps });
  });
  await deps.links.save(newLink(created, account));
  await syncOnce(deps);
  return { recoveryKey: created.recoveryKey };
}

/**
 * Another device: unlocks the folder's key, then either joins this browser's
 * house to the cloud one (the cloud keeps every section it has; this house only
 * adds) or replaces it by the cloud one, and runs a cycle.
 */
export async function joinCloud(
  deps: SyncDeps,
  secret: { password: string } | { recoveryKey: string },
  mode: 'join' | 'replace',
  account: { id?: string; label?: string },
): Promise<void> {
  await readableHouse(deps.house);
  const key = await unlockKeyFile(deps.drive, secret);
  const snapshots = await readSnapshots(deps.drive, key);
  if (snapshots.newer) throw new CloudSyncError('newer_app');
  const now = Math.floor(deps.now());
  const cloud = snapshots.theirs;
  // Replacing by nothing would empty this browser's house: refused, the house stays.
  if (mode === 'replace' && cloud.length === 0) throw new CloudSyncError('no_cloud_house');

  await deps.exclusive(async () => {
    const local = await readableHouse(deps.house);
    const [first, ...rest] = cloud;
    if (mode === 'replace' && first) {
      const replaced = mergeHouses(first, rest, now);
      await deps.house.save(replaced.data, replaced.meta);
      return;
    }
    // The cloud's newest generation, so these quarters join its union.
    const generation = newestGeneration(
      cloud.map((snapshot) => snapshot.meta.quartersGeneration),
      now,
    );
    const stamps = { ...local.meta.stamps };
    for (const section of SECTIONS) {
      const inCloud = cloud.some((snapshot) => snapshot.meta.stamps[section] !== 0);
      stamps[section] = inCloud ? 0 : hasData(local.data, section) ? now : 0;
    }
    await deps.house.save(local.data, {
      stamps,
      quartersGeneration: generation ? { ...generation } : local.meta.quartersGeneration,
    });
  });
  deps.onHouseChanged();
  await deps.links.save(newLink(key, account));
  await syncOnce(deps);
}

/**
 * Removes this device's snapshot (or, with `removeCloud`, every house, the
 * app's backups and `chave.json`) and this browser's link; the house here stays.
 */
export async function disconnect(deps: SyncDeps, options: { removeCloud: boolean }): Promise<void> {
  const { drive } = deps;
  const link = await deps.links.load();
  if (options.removeCloud) {
    // The key first: a device mid-cycle then finds the house removed and writes nothing more.
    await drive.remove(KEY_FILE);
    for (const entry of await drive.list(HOUSES_FOLDER)) {
      await drive.remove(`${HOUSES_FOLDER}/${entry.name}`);
    }
    for (const entry of await drive.list(BACKUPS_FOLDER)) {
      if (parseBackupName(entry.name)) await drive.remove(`${BACKUPS_FOLDER}/${entry.name}`);
    }
  } else if (link) {
    await drive.remove(housePath(link.deviceId));
  }
  await deps.links.clear();
  resetSnapshotCache();
}
