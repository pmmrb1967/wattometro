// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_AI_SETTINGS, loadAiSettings, saveAiSettings } from '../ai/settings';
import { pullAiSettings, removeAiSettings, storeAiSettings, type AiAccountApi } from './ai-sync';
import type { AccountAiSettings } from './api';

const EMAIL = 'ana@example.pt';
const KEY = { apiKey: 'sk-ant-sintetica', model: 'claude-haiku-5-5', autoSend: false };

/** The account on a fake server; `down` answers as a server without it (503). */
function account(initial: AccountAiSettings | null = null) {
  const state = { settings: initial, down: false, saves: 0 };
  const api: AiAccountApi = {
    fetch: async () =>
      state.down ? { ok: false, reason: 'unavailable' } : { ok: true, settings: state.settings },
    save: async (settings) => {
      if (state.down) return { ok: false, reason: 'unavailable' };
      state.saves++;
      state.settings = settings;
      return { ok: true };
    },
    remove: async () => {
      if (state.down) return { ok: false, reason: 'unavailable' };
      state.settings = null;
      return { ok: true };
    },
  };
  return { state, api };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  vi.stubGlobal('window', new EventTarget());
});

describe('AI settings in the account', () => {
  it('a key saved on the PC shows up on the phone', async () => {
    const server = account();
    expect(await storeAiSettings(EMAIL, KEY, server.api)).toBe('account');
    // The phone's browser: nothing of its own yet.
    localStorage.removeItem(`wattometro.ai.${EMAIL}`);
    localStorage.removeItem(`wattometro.ai-synced.${EMAIL}`);
    expect(await pullAiSettings(EMAIL, server.api)).toEqual({ settings: KEY, home: 'account' });
    expect(loadAiSettings(EMAIL)).toEqual(KEY);
  });

  it('sends a key saved before this existed to the account, once', async () => {
    saveAiSettings(EMAIL, KEY);
    const server = account();
    expect((await pullAiSettings(EMAIL, server.api))?.home).toBe('account');
    expect(server.state.settings).toEqual(KEY);
    await pullAiSettings(EMAIL, server.api);
    expect(server.state.saves).toBe(1);
  });

  it('a key deleted on another device goes from this one too, and is not sent back', async () => {
    const server = account();
    await storeAiSettings(EMAIL, KEY, server.api);
    server.state.settings = null;
    expect(await pullAiSettings(EMAIL, server.api)).toEqual({
      settings: EMPTY_AI_SETTINGS,
      home: 'account',
    });
    expect(loadAiSettings(EMAIL)).toEqual(EMPTY_AI_SETTINGS);
    expect(server.state.settings).toBeNull();
  });

  it('without the server, keeps the key in this browser', async () => {
    const server = account();
    server.state.down = true;
    expect(await storeAiSettings(EMAIL, KEY, server.api)).toBe('browser');
    expect(await pullAiSettings(EMAIL, server.api)).toEqual({ settings: KEY, home: 'browser' });
    // Not in the account, so deleting here is enough.
    expect(await removeAiSettings(EMAIL, server.api)).toEqual({ ok: true });
    expect(loadAiSettings(EMAIL)).toEqual(EMPTY_AI_SETTINGS);
  });

  it('keeps a key it could not delete from the account, to try again', async () => {
    const server = account();
    await storeAiSettings(EMAIL, KEY, server.api);
    server.state.down = true;
    expect((await removeAiSettings(EMAIL, server.api)).ok).toBe(false);
    expect(loadAiSettings(EMAIL)).toEqual(KEY);
    server.state.down = false;
    expect(await removeAiSettings(EMAIL, server.api)).toEqual({ ok: true });
    expect(server.state.settings).toBeNull();
    expect(loadAiSettings(EMAIL)).toEqual(EMPTY_AI_SETTINGS);
  });

  it('tells the pages when the settings change', async () => {
    const seen = vi.fn();
    window.addEventListener('wattometro:ai-settings', seen);
    await storeAiSettings(EMAIL, KEY, account().api);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
