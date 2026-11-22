// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where the local mode keeps its household: one record in this browser's
 * IndexedDB, apart from the caches (signing out clears those, never this).
 * Only "Apagar os dados deste browser" removes it.
 */
import type { LocalData } from './data';
import { emptyMeta, syncMetaSchema, type SyncMeta } from './meta';
import { readStored, type LocalRead } from './stored';

const DB_NAME = 'wattometro-local';
const STORE = 'household';
const KEY = 'data';
const META_KEY = 'meta';

/** What the local server reads and writes; IndexedDB in the app, memory in the tests. */
export interface LocalStore {
  load(): Promise<LocalRead>;
  /** True once it is on disk; false when the browser refused it (full, private window). */
  save(data: LocalData, meta?: SyncMeta): Promise<boolean>;
  /** The change stamps kept with the house; empty when none were kept. */
  loadMeta(): Promise<SyncMeta>;
  /** Removes the house and its stamps. False when the browser did not remove it. */
  clear(): Promise<boolean>;
}

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
      // The transaction, not the request: a full disk can still fail it when committing.
      transaction.oncomplete = () => resolve({ ok: true, value: request.result });
      transaction.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    } finally {
      db.close();
    }
  });
}

export const browserStore: LocalStore = {
  async load() {
    const read = await withStore('readonly', (store) => store.get(KEY) as IDBRequest<unknown>);
    return read.ok ? readStored(read.value) : { kind: 'unreadable' };
  },
  async loadMeta() {
    const read = await withStore('readonly', (store) => store.get(META_KEY) as IDBRequest<unknown>);
    const parsed = read.ok ? syncMetaSchema.safeParse(read.value) : null;
    return parsed?.success ? parsed.data : emptyMeta();
  },
  async save(data, meta) {
    // Both keys in one transaction: the stamps never describe another house than the one kept.
    return (
      await withStore('readwrite', (store) => {
        if (meta) store.put(meta, META_KEY);
        return store.put(data, KEY);
      })
    ).ok;
  },
  async clear() {
    return (
      await withStore('readwrite', (store) => {
        store.delete(META_KEY);
        return store.delete(KEY);
      })
    ).ok;
  },
};

export function memoryStore(initial: LocalData | null = null, meta?: SyncMeta): LocalStore {
  let kept = initial;
  let keptMeta = meta ? structuredClone(meta) : emptyMeta();
  return {
    load: () => Promise.resolve(kept ? { kind: 'ok', data: kept } : { kind: 'empty' }),
    loadMeta: () => Promise.resolve(structuredClone(keptMeta)),
    save: (data, next) => {
      kept = structuredClone(data);
      if (next) keptMeta = structuredClone(next);
      return Promise.resolve(true);
    },
    clear: () => {
      kept = null;
      keptMeta = emptyMeta();
      return Promise.resolve(true);
    },
  };
}
