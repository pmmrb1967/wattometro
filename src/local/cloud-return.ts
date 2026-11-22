// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Coming back from the Microsoft sign-in (a full-page redirect): main.tsx
 * starts finishing it before the router renders, and the part of the app that
 * left for it (Settings › Dados, or the banner's "Ligar de novo") takes the
 * result once, by the intent it gave to `signInToOneDrive`.
 */
import { completeOneDriveSignIn } from '../cloud/onedrive-auth';
import { oneDriveAvailable } from '../cloud/providers';

/** Linking this browser from Settings › Dados; signing in again from the banner. */
export type CloudIntent = 'connect' | 'reconnect';

export interface CloudReturn {
  intent: string;
  accountId: string;
}

let pending: Promise<CloudReturn | null> = Promise.resolve(null);
let taken = false;

/** On start, before the router: nothing happens unless a sign-in just came back. */
export function startCloudReturn(): void {
  if (!oneDriveAvailable()) return;
  pending = completeOneDriveSignIn().catch(() => null);
}

/** The sign-in that came back for `intent`, once; null for any other or none. */
export async function takeCloudReturn(intent: CloudIntent): Promise<{ accountId: string } | null> {
  const back = await pending;
  if (taken || back?.intent !== intent) return null;
  taken = true;
  return { accountId: back.accountId };
}
