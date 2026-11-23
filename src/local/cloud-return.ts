// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Coming back from a cloud sign-in page (a full-page redirect): main.tsx
 * starts finishing it before the router renders, and the part of the app that
 * left for it (Settings › Dados, the banner's "Ligar de novo", the landing
 * page) takes the result once, by the intent it gave to `signInToCloud`.
 * Microsoft comes back through MSAL; Dropbox and Google to /nuvem-retorno,
 * whose address is put back to the page that left before the router reads it
 * (adapted from Faturómetro, src/features/sync/cloud-return.ts).
 */
import { completeCloudSignIn, type CloudSignIn } from '../cloud/cloud-drives';
import { dropAllFreshTokens } from '../cloud/cloud-tokens';
import { CLOUD_RETURN_PATH, takeOAuthReturn, type OAuthReturn } from '../cloud/oauth';
import { cloudAvailable, providerAvailable, type CloudProvider } from '../cloud/providers';

/** Linking this browser from Settings › Dados; signing in again from the banner; opening a house from the landing page. */
export type CloudIntent = 'connect' | 'reconnect' | 'join';

export interface CloudReturn {
  provider: CloudProvider;
  accountId: string;
}

let pending: Promise<CloudSignIn | null> = Promise.resolve(null);
/** The intents whose flow has taken the sign-in. */
const cleared = new Set<CloudIntent>();

/** The page that left for the sign-in; the start page when this tab lost it. */
function returnAddress(oauth: OAuthReturn): string {
  return oauth.returnTo ?? '/';
}

/** On start, before the router: nothing happens unless a sign-in just came back. */
export function startCloudReturn(): void {
  const onReturnPath = window.location.pathname === CLOUD_RETURN_PATH;
  if (!cloudAvailable()) {
    // The code and state never stay in the address (or the history), whatever the build offers.
    if (onReturnPath) window.history.replaceState(null, '', '/');
    return;
  }
  cleared.clear();
  // Sign-ins left in this tab (cancelled, abandoned) go before a new one is held.
  dropAllFreshTokens();
  let oauth: OAuthReturn | null = null;
  try {
    oauth = takeOAuthReturn(new URL(window.location.href));
  } catch {
    // No sessionStorage: not a return this tab can finish.
  }
  if (oauth) window.history.replaceState(null, '', returnAddress(oauth));
  else if (onReturnPath) window.history.replaceState(null, '', '/');
  // Without a PKCE return only MSAL can have one, and only where OneDrive is offered.
  pending =
    oauth || providerAvailable('onedrive')
      ? completeCloudSignIn(oauth).catch(() => null)
      : Promise.resolve(null);
}

/**
 * The sign-in that came back for `intent`; null for any other, a refused one
 * or none. The same answer on every call (React's StrictMode runs effects
 * twice) until `clearCloudReturn` says the flow has taken it.
 */
export async function takeCloudReturn(intent: CloudIntent): Promise<CloudReturn | null> {
  const back = await pending;
  if (cleared.has(intent) || !back || back.intent !== intent || !('accountId' in back)) {
    return null;
  }
  return { provider: back.provider, accountId: back.accountId };
}

/**
 * The service whose sign-in for `intent` failed (the code was refused, the
 * exchange failed); null when it worked, came for another intent, or the user
 * only cancelled at the service. Same clear semantics as `takeCloudReturn`.
 */
export async function takeCloudFailure(intent: CloudIntent): Promise<CloudProvider | null> {
  const back = await pending;
  if (cleared.has(intent) || !back || back.intent !== intent || !('error' in back)) return null;
  return back.error === 'access_denied' ? null : back.provider;
}

/** The flow for `intent` has the sign-in: later calls get null (another visit to the page). */
export function clearCloudReturn(intent: CloudIntent): void {
  cleared.add(intent);
}
