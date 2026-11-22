// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cloudStatus,
  cloudWorking,
  localHouseHasData,
  notifyLocalWrite,
  restoredMeta,
  startCloudRunner,
} from './cloud-runner';
import { memoryCloudLinkStore, type CloudLink } from './cloud-state';
import type { SyncResult } from './cloud-sync';
import { emptyLocalData, type LocalData } from './data';
import { SECTIONS } from './meta';
import { memoryStore, type LocalStore } from './store';

const DONE: SyncResult = { pulled: 0, pushed: false, backup: false };
const DAY = 86_400;

describe('startCloudRunner', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('runs once on start', async () => {
    const run = vi.fn(() => Promise.resolve(DONE));
    stop = startCloudRunner({ run });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs every 5 minutes while open, and no more once stopped', async () => {
    const run = vi.fn(() => Promise.resolve(DONE));
    stop = startCloudRunner({ run });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs 10 s after the last write, once for a burst', async () => {
    const run = vi.fn(() => Promise.resolve(DONE));
    stop = startCloudRunner({ run });
    await vi.advanceTimersByTimeAsync(0);
    notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(4_000);
    notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(4_000);
    notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('waits retryAfter after throttled', async () => {
    const run = vi
      .fn<() => Promise<SyncResult>>()
      .mockResolvedValueOnce({ ...DONE, error: 'throttled', retryAfterSeconds: 120 })
      .mockResolvedValue(DONE);
    stop = startCloudRunner({ run });
    await vi.advanceTimersByTimeAsync(0);
    notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(119_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs again after a cycle that was asked for while one was running', async () => {
    let finish: (result: SyncResult) => void = () => undefined;
    const run = vi
      .fn<() => Promise<SyncResult>>()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue(DONE);
    stop = startCloudRunner({ run });
    await vi.advanceTimersByTimeAsync(0);
    notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    finish(DONE);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('writes before any runner started are not kept for it', async () => {
    notifyLocalWrite();
    const run = vi.fn(() => Promise.resolve(DONE));
    stop = startCloudRunner({ run });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('cloudWorking', () => {
  const NOW = 1_800_000_000;
  it('is a link without an error that synced in the last 30 days', () => {
    expect(cloudWorking({ linked: true, lastSyncAt: NOW - 29 * DAY }, NOW)).toBe(true);
    expect(cloudWorking({ linked: true, lastSyncAt: NOW - 31 * DAY }, NOW)).toBe(false);
    expect(cloudWorking({ linked: true }, NOW)).toBe(false);
    expect(cloudWorking({ linked: true, lastSyncAt: NOW, error: 'needs_reconnect' }, NOW)).toBe(
      false,
    );
    expect(cloudWorking({ linked: false }, NOW)).toBe(false);
  });

  it('ignores offline and throttled while the last sync is recent', () => {
    const recent = NOW - DAY;
    expect(cloudWorking({ linked: true, lastSyncAt: recent, error: 'offline' }, NOW)).toBe(true);
    expect(cloudWorking({ linked: true, lastSyncAt: recent, error: 'throttled' }, NOW)).toBe(true);
    expect(cloudWorking({ linked: true, lastSyncAt: NOW - 31 * DAY, error: 'offline' }, NOW)).toBe(
      false,
    );
    for (const error of [
      'needs_reconnect',
      'quota_full',
      'newer_app',
      'unreadable_device',
      'removed',
      'unexpected',
      'conflict',
    ] as const) {
      expect(cloudWorking({ linked: true, lastSyncAt: recent, error }, NOW)).toBe(false);
    }
  });
});

describe('restoredMeta', () => {
  it('stamps every section now and starts a new quarters generation', () => {
    const meta = restoredMeta(1_800_000_000);
    for (const section of SECTIONS) expect(meta.stamps[section]).toBe(1_800_000_000);
    expect(meta.quartersGeneration.at).toBe(1_800_000_000);
    expect(meta.quartersGeneration.id).not.toBe('');
    expect(restoredMeta(1_800_000_000).quartersGeneration.id).not.toBe(meta.quartersGeneration.id);
  });
});

describe('localHouseHasData', () => {
  const withData = (patch: Partial<LocalData>) => memoryStore({ ...emptyLocalData(), ...patch });

  it('is false for no house or an empty one', async () => {
    expect(await localHouseHasData(memoryStore(null))).toBe(false);
    expect(await localHouseHasData(memoryStore(emptyLocalData()))).toBe(false);
  });

  it('is true for a house with data in any section, not only quarters or tariffs', async () => {
    const equipment = [{ name: 'Frigorífico' }] as unknown as LocalData['equipment'];
    const alwaysOn = [{ name: 'Router' }] as unknown as LocalData['alwaysOn'];
    const installation = { ...emptyLocalData().installation, electricCar: true };
    for (const store of [
      withData({ equipment }),
      withData({ alwaysOn }),
      withData({ zone: 'A' }),
      withData({ budget: 5_000 } as unknown as Partial<LocalData>),
      withData({ installation }),
    ]) {
      expect(await localHouseHasData(store)).toBe(true);
    }
  });

  it('is true for a house that cannot be read', async () => {
    const unreadable: LocalStore = {
      ...memoryStore(null),
      load: () => Promise.resolve({ kind: 'unreadable' }),
    };
    expect(await localHouseHasData(unreadable)).toBe(true);
  });
});

describe('cloudStatus', () => {
  const link = { provider: 'onedrive', deviceId: 'd', keyId: 'k' } as unknown as CloudLink;

  it('is not linked, without reading the link, where OneDrive is not offered', async () => {
    const links = memoryCloudLinkStore(link);
    const load = vi.spyOn(links, 'load');
    expect(await cloudStatus(() => false, links)).toEqual({ linked: false });
    expect(load).not.toHaveBeenCalled();
    expect(cloudWorking(await cloudStatus(() => false, links), 0)).toBe(false);
  });

  it('reads the link where OneDrive is offered', async () => {
    const links = memoryCloudLinkStore({ ...link, lastSyncAt: 100, accountLabel: 'a@example.com' });
    expect(await cloudStatus(() => true, links)).toEqual({
      linked: true,
      lastSyncAt: 100,
      accountLabel: 'a@example.com',
    });
  });
});
