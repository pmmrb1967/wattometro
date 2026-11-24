// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What this browser keeps about the household copies, in its own IndexedDB:
 * the folder chosen for them (folder.ts) and a restore still going (restore.ts:
 * the sealed file with its non-extractable key, and how far it went). Nothing
 * here is readable without the key, which never leaves WebCrypto.
 */
const DB_NAME = 'wattometro-backup';
const STORE = 'kept';

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
      transaction.onerror = () => resolve({ ok: false });
      transaction.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    } finally {
      db.close();
    }
  });
}

export type KeptName = 'folder' | 'restoreFile' | 'restoreProgress';

export async function readKept<T>(name: KeptName): Promise<T | null> {
  const result = await withStore<unknown>('readonly', (store) => store.get(name));
  return result.ok && result.value !== undefined ? (result.value as T) : null;
}

/** True once it is kept. */
export async function writeKept(name: KeptName, value: unknown): Promise<boolean> {
  return (await withStore('readwrite', (store) => store.put(value, name))).ok;
}

export async function removeKept(...names: KeptName[]): Promise<void> {
  for (const name of names) await withStore('readwrite', (store) => store.delete(name));
}
