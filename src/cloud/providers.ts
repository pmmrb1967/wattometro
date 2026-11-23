// SPDX-License-Identifier: AGPL-3.0-or-later
/** Adapted from Faturómetro (src/cloud/providers.ts). The clouds a house can sync through, and which ones this build offers. */
import {
  PROJECT_DROPBOX_APP_KEY,
  PROJECT_GOOGLE_CLIENT_ID,
  PROJECT_ONEDRIVE_CLIENT_ID,
} from './cloud-config';

export type CloudProvider = 'onedrive' | 'gdrive' | 'dropbox';

function fromBuild(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}

/** The app's id with each service (not secrets: they only name the app on the sign-in page). */
export function providerClientId(provider: CloudProvider): string {
  switch (provider) {
    case 'onedrive':
      return fromBuild(import.meta.env.VITE_ONEDRIVE_CLIENT_ID, PROJECT_ONEDRIVE_CLIENT_ID);
    case 'dropbox':
      return fromBuild(import.meta.env.VITE_DROPBOX_APP_KEY, PROJECT_DROPBOX_APP_KEY);
    case 'gdrive':
      return fromBuild(import.meta.env.VITE_GOOGLE_CLIENT_ID, PROJECT_GOOGLE_CLIENT_ID);
  }
}

/** The app's id with Microsoft (kept for onedrive-auth.ts). */
export function oneDriveClientId(): string {
  return providerClientId('onedrive');
}

/** A service is offered only when the app is registered with it. */
export function providerAvailable(provider: CloudProvider): boolean {
  return providerClientId(provider) !== '';
}

export const PROVIDER_ORDER: readonly CloudProvider[] = ['onedrive', 'gdrive', 'dropbox'];

export function availableProviders(): CloudProvider[] {
  return PROVIDER_ORDER.filter(providerAvailable);
}

/** Is any cloud service offered? Without one the app behaves as without cloud. */
export function cloudAvailable(): boolean {
  return availableProviders().length > 0;
}

export function providerName(provider: CloudProvider): string {
  switch (provider) {
    case 'onedrive':
      return 'OneDrive';
    case 'gdrive':
      return 'Google Drive';
    case 'dropbox':
      return 'Dropbox';
  }
}

/** The company behind the service's sign-in page and account. */
export function providerCompany(provider: CloudProvider): string {
  switch (provider) {
    case 'onedrive':
      return 'Microsoft';
    case 'gdrive':
      return 'Google';
    case 'dropbox':
      return 'Dropbox';
  }
}
