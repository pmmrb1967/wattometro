// SPDX-License-Identifier: AGPL-3.0-or-later
import { providerName, type CloudProvider } from '../cloud/providers';
import { t } from '../i18n/pt-PT';
import { CloudKeyError } from '../local/cloud-files';
import { CloudSyncError } from '../local/cloud-sync';

const texts = t.cloud;

/** The message for what went wrong opening or linking the house in `provider`'s folder. */
export function cloudFailure(error: unknown, provider: CloudProvider): string {
  const service = providerName(provider);
  if (error instanceof CloudKeyError && error.code === 'wrong_secret')
    return texts.join.wrongSecret;
  if (error instanceof CloudSyncError) {
    switch (error.code) {
      case 'newer_app':
        return texts.newerApp(service);
      case 'no_cloud_house':
        return texts.join.noCloudHouse(service);
      case 'unreadable_house':
        return texts.unreadableHouse;
    }
  }
  return texts.failed(service);
}
