// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What this browser keeps about its link to the cloud folder (docs/superpowers/
 * specs/2026-11-22-local-cloud-sync-design.md, "Sincronizar"): its device id,
 * the key of the folder (a non-extractable CryptoKey, kept as it is) and how the
 * last cycle went. Its own IndexedDB, apart from the house: disconnecting
 * removes this and leaves the house.
 */
import type { CloudErrorCode } from '../cloud/drive';

export interface CloudLink {
  provider: 'onedrive';
  deviceId: string;
  keyId: string;
  masterKey: CryptoKey;
  accountId?: string;
  accountLabel?: string;
  /** Epoch seconds of the last cycle that ended without an error. */
  lastSyncAt?: number;
  /** The largest change stamp of the last snapshot this device wrote. */
  lastPushedStamp?: number;
  error?: CloudErrorCode | 'unreadable_device' | 'newer_app' | 'removed';
}

export interface CloudLinkStore {
  load(): Promise<CloudLink | null>;
  /** True once it is kept; false when the browser refused it. */
  save(link: CloudLink): Promise<boolean>;
  clear(): Promise<boolean>;
}

const DB_NAME = 'wattometro-cloud';
const STORE = 'link';
const KEY = 'link';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  const db = await openDb();
  if (!db) return { ok: false };
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve({ ok: true, value: request.result });
      transaction.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    } finally {
      db.close();
    }
  });
}

function isLink(value: unknown): value is CloudLink {
  if (typeof value !== 'object' || value === null) return false;
  const link = value as Partial<CloudLink>;
  return (
    link.provider === 'onedrive' &&
    typeof link.deviceId === 'string' &&
    typeof link.keyId === 'string' &&
    typeof CryptoKey !== 'undefined' &&
    link.masterKey instanceof CryptoKey
  );
}

export const browserCloudLinkStore: CloudLinkStore = {
  async load() {
    const read = await withStore('readonly', (store) => store.get(KEY) as IDBRequest<unknown>);
    return read.ok && isLink(read.value) ? read.value : null;
  },
  async save(link) {
    // The CryptoKey goes in as it is: IndexedDB clones it without exposing the key.
    return (await withStore('readwrite', (store) => store.put(link, KEY))).ok;
  },
  async clear() {
    return (await withStore('readwrite', (store) => store.delete(KEY))).ok;
  },
};

export function memoryCloudLinkStore(initial?: CloudLink): CloudLinkStore {
  let kept: CloudLink | null = initial ? { ...initial } : null;
  return {
    load: () => Promise.resolve(kept ? { ...kept } : null),
    save: (link) => {
      kept = { ...link };
      return Promise.resolve(true);
    },
    clear: () => {
      kept = null;
      return Promise.resolve(true);
    },
  };
}
