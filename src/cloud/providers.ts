// SPDX-License-Identifier: AGPL-3.0-or-later
/** Adapted from Faturómetro (src/cloud/providers.ts): only OneDrive. */
import { PROJECT_ONEDRIVE_CLIENT_ID } from './cloud-config';

/** The app's id with Microsoft (not a secret: it only names the app on the sign-in page). */
export function oneDriveClientId(): string {
  const fromBuild: unknown = import.meta.env.VITE_ONEDRIVE_CLIENT_ID;
  return typeof fromBuild === 'string' && fromBuild ? fromBuild : PROJECT_ONEDRIVE_CLIENT_ID;
}

/** OneDrive is offered only when the app is registered with Microsoft. */
export function oneDriveAvailable(): boolean {
  return oneDriveClientId() !== '';
}
