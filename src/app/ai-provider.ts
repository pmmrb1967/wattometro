// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The provider of the user's choice, for the pages. The free AI goes through
 * the project's Worker, so it needs an account: in the local mode and the
 * demonstration (/v1 answered in the browser) only a key of one's own works.
 */
import type { AiProvider } from '../ai/provider';
import { providerFromSettings, type AiSettings } from '../ai/settings';
import { isDemo } from '../demo/mode';
import { isLocal } from '../local/mode';
import { askFreeAi } from './api';

/** Whether the free AI can be offered here. */
export const freeAiOffered = (): boolean => !isLocal() && !isDemo();

export function appProvider(settings: AiSettings): AiProvider | undefined {
  return providerFromSettings(settings, freeAiOffered() ? askFreeAi : undefined);
}
