// SPDX-License-Identifier: AGPL-3.0-or-later
import { t } from '../i18n/pt-PT';
import { CloudKeyError } from '../local/cloud-files';
import { CloudSyncError } from '../local/cloud-sync';

const texts = t.cloud;

/** The message for what went wrong opening or linking the OneDrive house. */
export function cloudFailure(error: unknown): string {
  if (error instanceof CloudKeyError && error.code === 'wrong_secret')
    return texts.join.wrongSecret;
  if (error instanceof CloudSyncError) {
    return error.code === 'newer_app' ? texts.newerApp : texts.unreadableHouse;
  }
  return texts.failed;
}
