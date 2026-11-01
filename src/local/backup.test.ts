// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askPersistence,
  clearBackupMarks,
  LOCAL_CHANGED,
  localStatus,
  markBackup,
  markChanged,
  readBackupMarks,
  watchOtherTabs,
} from './backup';
import { emptyLocalData } from './data';
import type { LocalRead } from './stored';

const DAY = 86_400;
const NOW = 1_800_000_000;
const WITH_DATA: LocalRead = {
  kind: 'ok',
  data: { ...emptyLocalData(), quarters: [[1_768_435_200, 100, 0]] },
};
const NEVER = { backupAt: null, changedAt: null };

describe('localStatus', () => {
  it('says nothing about copies while there is nothing to copy', () => {
    expect(localStatus({ kind: 'empty' }, NEVER, NOW)).toEqual({ kind: 'empty' });
    expect(localStatus({ kind: 'ok', data: emptyLocalData() }, NEVER, NOW)).toEqual({
      kind: 'empty',
    });
  });

  it('counts a tariff as something to copy', () => {
    const data = { ...emptyLocalData(), tariffs: [{ id: 'x' } as never] };
    expect(localStatus({ kind: 'ok', data }, NEVER, NOW)).toEqual({ kind: 'never' });
  });

  it('warns when data exist and no copy was ever made', () => {
    expect(localStatus(WITH_DATA, NEVER, NOW)).toEqual({ kind: 'never' });
  });

  it('warns when the copy is over 30 days old and the house changed since', () => {
    const marks = { backupAt: NOW - 31 * DAY, changedAt: NOW - DAY };
    expect(localStatus(WITH_DATA, marks, NOW)).toEqual({ kind: 'due', at: marks.backupAt });
  });

  it('does not warn about an old copy of a house that did not change', () => {
    const marks = { backupAt: NOW - 200 * DAY, changedAt: NOW - 201 * DAY };
    expect(localStatus(WITH_DATA, marks, NOW)).toEqual({ kind: 'fresh', at: marks.backupAt });
  });

  it('does not warn yet about a recent copy of a house that changed', () => {
    const marks = { backupAt: NOW - 29 * DAY, changedAt: NOW - DAY };
    expect(localStatus(WITH_DATA, marks, NOW)).toEqual({ kind: 'fresh', at: marks.backupAt });
  });

  it('puts data it cannot read above everything else', () => {
    expect(localStatus({ kind: 'unreadable' }, NEVER, NOW)).toEqual({ kind: 'unreadable' });
  });
});

describe('backup marks', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the copy and the last change until they are cleared', () => {
    markBackup(100);
    markChanged(200);
    expect(readBackupMarks()).toEqual({ backupAt: 100, changedAt: 200 });
    clearBackupMarks();
    expect(readBackupMarks()).toEqual(NEVER);
  });

  it('tells the page when either happens', () => {
    const heard = vi.fn();
    window.addEventListener(LOCAL_CHANGED, heard);
    markBackup(100);
    markChanged(200);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('hears what another tab did to the copy or the house, and nothing else', () => {
    const heard = vi.fn();
    const stop = watchOtherTabs(heard);
    const stored = (key: string | null) =>
      window.dispatchEvent(Object.assign(new Event('storage'), { key }));
    stored('wattometro.nav.collapsed');
    expect(heard).not.toHaveBeenCalled();
    stored('wattometro.local.pulse');
    stored(null); // the whole storage was cleared
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    stored('wattometro.local.pulse');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('changes what other tabs hear on each write, even within the same second', () => {
    vi.useFakeTimers({ now: 1_000 });
    const pulse = () => localStorage.getItem('wattometro.local.pulse');
    markChanged(1);
    const first = pulse();
    vi.advanceTimersByTime(1);
    markChanged(1);
    const second = pulse();
    vi.advanceTimersByTime(1);
    clearBackupMarks();
    vi.useRealTimers();
    expect(first).not.toBeNull();
    expect(second).not.toBe(first);
    expect(pulse()).not.toBe(second);
  });

  it('counts as no copy when the browser has no storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readBackupMarks()).toEqual(NEVER);
  });
});

describe('askPersistence', () => {
  it('asks the browser while the storage is not persistent', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    await askPersistence({ persisted: () => Promise.resolve(false), persist });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not ask again once it is persistent', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    await askPersistence({ persisted: () => Promise.resolve(true), persist });
    expect(persist).not.toHaveBeenCalled();
  });

  it('copes with a browser without it, or that fails', async () => {
    await expect(askPersistence(undefined)).resolves.toBeUndefined();
    await expect(askPersistence({})).resolves.toBeUndefined();
    await expect(
      askPersistence({ persisted: () => Promise.reject(new Error('no')) }),
    ).resolves.toBeUndefined();
  });
});
