// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where the local mode keeps its household: one record in this browser's
 * IndexedDB, apart from the caches (signing out clears those, never this).
 * Only "Apagar os dados deste browser" removes it.
 */
import { localDataSchema, type LocalData } from './data';

const DB_NAME = 'wattometro-local';
const STORE = 'household';
const KEY = 'data';

/** What the local server reads and writes; IndexedDB in the app, memory in the tests. */
export interface LocalStore {
  /** Null when nothing is kept (or it cannot be read as this version). */
  load(): Promise<LocalData | null>;
  /** False when the browser refused it (full, private window). */
  save(data: LocalData): Promise<boolean>;
  clear(): Promise<void>;
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
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve({ ok: true, value: request.result });
      request.onerror = () => resolve({ ok: false });
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
    if (!read.ok || read.value === undefined) return null;
    const parsed = localDataSchema.safeParse(read.value);
    return parsed.success ? parsed.data : null;
  },
  async save(data) {
    return (await withStore('readwrite', (store) => store.put(data, KEY))).ok;
  },
  async clear() {
    await withStore('readwrite', (store) => store.delete(KEY));
  },
};

export function memoryStore(initial: LocalData | null = null): LocalStore {
  let kept = initial;
  return {
    load: () => Promise.resolve(kept),
    save: (data) => {
      kept = structuredClone(data);
      return Promise.resolve(true);
    },
    clear: () => {
      kept = null;
      return Promise.resolve();
    },
  };
}
