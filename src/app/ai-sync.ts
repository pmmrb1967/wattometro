// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The AI settings follow the account (as in ifanalysis): kept on the server,
 * the key sealed with a Worker secret (server/src/secret-box.ts), and copied
 * into each browser (src/ai/settings.ts), from where the questions still go
 * straight to Anthropic.
 *
 * A copy that came from (or went to) the account is marked synced: if the
 * account no longer has it, it was deleted on another device, and goes here
 * too. A key saved before this existed (not marked) is sent to the account
 * once. Without the server (offline, or no AI_KEY_SECRET) the key stays in
 * this browser.
 */
import { useEffect, useReducer } from 'react';
import {
  EMPTY_AI_SETTINGS,
  forgetAiSettings,
  hasAiKey,
  loadAiSettings,
  saveAiSettings,
  toAiSettings,
  type AiSettings,
} from '../ai/settings';
import {
  deleteAccountAiSettings,
  fetchAccountAiSettings,
  saveAccountAiSettings,
  type AccountAiSettings,
  type Failure,
} from './api';

/** Where the settings are: in the account (every device), or only in this browser. */
export type AiHome = 'account' | 'browser';

export interface AiAccountApi {
  fetch: () => Promise<{ ok: true; settings: AccountAiSettings | null } | Failure>;
  save: (settings: AccountAiSettings) => Promise<{ ok: true } | Failure>;
  remove: () => Promise<{ ok: true } | Failure>;
}

const serverApi: AiAccountApi = {
  fetch: fetchAccountAiSettings,
  save: saveAccountAiSettings,
  remove: deleteAccountAiSettings,
};

const EVENT = 'wattometro:ai-settings';
const syncedKey = (email: string) => `wattometro.ai-synced.${email}`;

function isSynced(email: string): boolean {
  try {
    return localStorage.getItem(syncedKey(email)) === '1';
  } catch {
    return false;
  }
}

function markSynced(email: string, synced: boolean): void {
  try {
    if (synced) localStorage.setItem(syncedKey(email), '1');
    else localStorage.removeItem(syncedKey(email));
  } catch {
    // Without storage nothing is kept here anyway.
  }
}

/** Tells the pages reading the settings (useAiSettings) that they changed. */
function changed(): void {
  window.dispatchEvent(new Event(EVENT));
}

const toAccount = ({ apiKey, model, autoSend }: AiSettings): AccountAiSettings => ({
  apiKey,
  model,
  autoSend,
});

/** Brings this browser's copy up to date with the account; null when the session ended. */
export async function pullAiSettings(
  email: string,
  api: AiAccountApi = serverApi,
): Promise<{ settings: AiSettings; home: AiHome } | null> {
  const local = loadAiSettings(email);
  const remote = await api.fetch();
  if (!remote.ok) {
    return remote.reason === 'unauthenticated' ? null : { settings: local, home: 'browser' };
  }
  if (remote.settings) {
    const settings = toAiSettings(remote.settings);
    saveAiSettings(email, settings);
    markSynced(email, true);
    changed();
    return { settings, home: 'account' };
  }
  if (isSynced(email)) {
    // Deleted on another device.
    forgetAiSettings(email);
    markSynced(email, false);
    changed();
    return { settings: EMPTY_AI_SETTINGS, home: 'account' };
  }
  if (hasAiKey(local)) {
    const saved = await api.save(toAccount(local));
    markSynced(email, saved.ok);
    return { settings: local, home: saved.ok ? 'account' : 'browser' };
  }
  return { settings: local, home: 'account' };
}

/** Saves in this browser and in the account; says where it ended up. */
export async function storeAiSettings(
  email: string,
  settings: AiSettings,
  api: AiAccountApi = serverApi,
): Promise<AiHome> {
  saveAiSettings(email, settings);
  changed();
  const saved = await api.save(toAccount(settings));
  markSynced(email, saved.ok);
  return saved.ok ? 'account' : 'browser';
}

/**
 * Deletes the key everywhere. A key that is in the account and could not be
 * deleted there is kept here too, so the user can try again.
 */
export async function removeAiSettings(
  email: string,
  api: AiAccountApi = serverApi,
): Promise<{ ok: true } | Failure> {
  const removed = await api.remove();
  if (!removed.ok && isSynced(email)) return removed;
  forgetAiSettings(email);
  markSynced(email, false);
  changed();
  return { ok: true };
}

/** The settings in this browser, read again whenever they change. */
export function useAiSettings(email: string): AiSettings {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, []);
  return loadAiSettings(email);
}
