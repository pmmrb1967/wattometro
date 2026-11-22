// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyLocalData } from './data';
import { emptyMeta } from './meta';
import { browserStore, memoryStore } from './store';

interface FakeRequest {
  result: unknown;
  onsuccess?: () => void;
}

/** IndexedDB where each request succeeds, and the transaction then commits or aborts. */
function stubIndexedDb(ending: 'complete' | 'abort', result?: unknown) {
  const finished = () => {
    const request: FakeRequest = { result };
    queueMicrotask(() => {
      request.onsuccess?.();
      if (ending === 'complete') transaction.oncomplete?.();
      else transaction.onabort?.();
    });
    return request;
  };
  const transaction: {
    oncomplete?: () => void;
    onabort?: () => void;
    objectStore: () => Record<string, () => FakeRequest>;
  } = { objectStore: () => ({ get: finished, put: finished, delete: finished }) };
  const db = { transaction: () => transaction, close: () => undefined };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: FakeRequest = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
}

describe('browserStore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says it kept the data once the transaction completes', async () => {
    stubIndexedDb('complete');
    expect(await browserStore.save(emptyLocalData())).toBe(true);
  });

  it('does not say so when the disk fails it after the request was accepted', async () => {
    stubIndexedDb('abort');
    expect(await browserStore.save(emptyLocalData())).toBe(false);
  });

  it('says when removing failed', async () => {
    stubIndexedDb('abort');
    expect(await browserStore.clear()).toBe(false);
    stubIndexedDb('complete');
    expect(await browserStore.clear()).toBe(true);
  });

  it('tells a failed read from nothing kept', async () => {
    stubIndexedDb('abort');
    expect(await browserStore.load()).toEqual({ kind: 'unreadable' });
    stubIndexedDb('complete');
    expect(await browserStore.load()).toEqual({ kind: 'empty' });
  });

  it('reads what is kept', async () => {
    stubIndexedDb('complete', emptyLocalData());
    expect(await browserStore.load()).toEqual({ kind: 'ok', data: emptyLocalData() });
  });
});

describe('browserStore meta', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The stub returns one fixed result per get, so this reads back what the stub holds.
  it('reads the stamps it holds', async () => {
    const meta = { ...emptyMeta(), stamps: { ...emptyMeta().stamps, zone: 5 } };
    stubIndexedDb('complete', meta);
    expect(await browserStore.save(emptyLocalData(), meta)).toBe(true);
    expect(await browserStore.loadMeta()).toEqual(meta);
  });

  it('reads invalid stamps as emptyMeta()', async () => {
    stubIndexedDb('complete', { stamps: {} });
    expect(await browserStore.loadMeta()).toEqual(emptyMeta());
  });
});

describe('memoryStore meta', () => {
  it('keeps meta with the house', async () => {
    const store = memoryStore();
    const meta = { ...emptyMeta(), stamps: { ...emptyMeta().stamps, zone: 5 } };
    await store.save(emptyLocalData(), meta);
    expect(await store.loadMeta()).toEqual(meta);
  });

  it('loadMeta without meta is emptyMeta()', async () => {
    expect(await memoryStore(emptyLocalData()).loadMeta()).toEqual(emptyMeta());
  });

  it('clear removes the meta', async () => {
    const store = memoryStore();
    await store.save(emptyLocalData(), {
      ...emptyMeta(),
      stamps: { ...emptyMeta().stamps, zone: 5 },
    });
    await store.clear();
    expect(await store.loadMeta()).toEqual(emptyMeta());
  });
});
