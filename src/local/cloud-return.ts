// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Coming back from the Microsoft sign-in (a full-page redirect): main.tsx
 * starts finishing it before the router renders, and the part of the app that
 * left for it (Settings › Dados, or the banner's "Ligar de novo") takes the
 * result once, by the intent it gave to `signInToOneDrive`.
 */
import { completeOneDriveSignIn } from '../cloud/onedrive-auth';
import { oneDriveAvailable } from '../cloud/providers';

/** Linking this browser from Settings › Dados; signing in again from the banner; opening a house from the landing page. */
export type CloudIntent = 'connect' | 'reconnect' | 'join';

export interface CloudReturn {
  intent: string;
  accountId: string;
}

let pending: Promise<CloudReturn | null> = Promise.resolve(null);
/** The intents whose flow has taken the sign-in. */
const cleared = new Set<CloudIntent>();

/** On start, before the router: nothing happens unless a sign-in just came back. */
export function startCloudReturn(): void {
  if (!oneDriveAvailable()) return;
  cleared.clear();
  pending = completeOneDriveSignIn().catch(() => null);
}

/**
 * The sign-in that came back for `intent`; null for any other or none. The same
 * answer on every call (React's StrictMode runs effects twice) until
 * `clearCloudReturn` says the flow has taken it.
 */
export async function takeCloudReturn(intent: CloudIntent): Promise<{ accountId: string } | null> {
  const back = await pending;
  if (cleared.has(intent) || back?.intent !== intent) return null;
  return { accountId: back.accountId };
}

/** The flow for `intent` has the sign-in: later calls get null (another visit to the page). */
export function clearCloudReturn(intent: CloudIntent): void {
  cleared.add(intent);
}
