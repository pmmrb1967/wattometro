// SPDX-License-Identifier: AGPL-3.0-or-later
import { AiError, type AiErrorCode } from '../ai/provider';
import { t } from '../i18n/pt-PT';

/** What to tell the user when an AI request fails. */
export function aiErrorText(error: unknown): string {
  const code: AiErrorCode = error instanceof AiError ? error.code : 'unavailable';
  return t.ai.errors[code];
}
