// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Adapted from Faturómetro (src/cloud/cloud-drives.ts).
 *
 * The drive of each cloud service, and the sign-in to each: OneDrive through
 * MSAL (src/cloud/onedrive-auth.ts), Dropbox and Google Drive through the PKCE
 * redirect (src/cloud/oauth.ts) and a lasting link kept in the house's CloudLink.
 * Google's token exchange and renewals go through the same-origin Worker route
 * `/v1/google/token` (it holds the client secret and keeps nothing).
 */
import { dropFreshTokens, freshTokens, holdFreshTokens, tokenSource } from './cloud-tokens';
import { CloudError, type CloudDrive } from './drive';
import { Dropbox, type TokenGetter } from './dropbox';
import {
  dropboxAuthorizeUrl,
  exchangeDropboxCode,
  refreshDropbox,
  type AccessToken,
  type FreshTokens,
} from './dropbox-auth';
import { GoogleDrive } from './gdrive';
import { exchangeGoogleCode, googleAuthorizeUrl, refreshGoogle } from './gdrive-auth';
import { startOAuth, type OAuthReturn } from './oauth';
import { OneDrive } from './onedrive';
import {
  completeOneDriveSignIn,
  oneDriveAccountLabel,
  oneDriveToken,
  signInToOneDrive,
  signOutOfOneDrive,
} from './onedrive-auth';
import { providerClientId, type CloudProvider } from './providers';

/** Same origin as the app: the Worker route that adds Google's client secret. */
const GOOGLE_SERVER_URL = '';

/** The OneDrive of a signed-in Microsoft account (the last one when not given). */
export function oneDriveFor(accountId?: string): CloudDrive {
  return new OneDrive(() => oneDriveToken(accountId), {
    label: () => oneDriveAccountLabel(accountId),
  });
}

function renewer(provider: 'dropbox' | 'gdrive'): (refreshToken: string) => Promise<AccessToken> {
  return provider === 'dropbox'
    ? (refreshToken) => refreshDropbox({ appKey: providerClientId('dropbox'), refreshToken })
    : (refreshToken) => refreshGoogle({ serverUrl: GOOGLE_SERVER_URL, refreshToken });
}

function driveOf(provider: 'dropbox' | 'gdrive', getToken: TokenGetter): CloudDrive {
  return provider === 'dropbox' ? new Dropbox(getToken) : new GoogleDrive(getToken);
}

/** The drive of a house's link: OneDrive by account, the others by their lasting link. */
export function linkedDrive(link: {
  provider: CloudProvider;
  accountId?: string;
  refreshToken?: string;
}): CloudDrive {
  const { provider, refreshToken } = link;
  if (provider === 'onedrive') return oneDriveFor(link.accountId);
  return driveOf(
    provider,
    tokenSource({ refreshToken: async () => refreshToken, refresh: renewer(provider) }),
  );
}

/** The drive right after a sign-in, before the house has the link (`accountId` from the return). */
export function signedInDrive(provider: CloudProvider, accountId: string): CloudDrive {
  if (provider === 'onedrive') return oneDriveFor(accountId);
  const held = freshTokens(accountId);
  return driveOf(
    provider,
    tokenSource({
      refreshToken: async () => held?.refreshToken,
      ...(held ? { initial: held } : {}),
      refresh: renewer(provider),
    }),
  );
}

/** The lasting link of a sign-in that just came back (Dropbox and Google Drive). */
export function signedInLink(provider: CloudProvider, accountId: string): string | undefined {
  if (provider === 'onedrive') return undefined;
  return freshTokens(accountId)?.refreshToken;
}

/** Once the house keeps the link: forget the copy in this tab. */
export function forgetSignIn(provider: CloudProvider, accountId: string): void {
  if (provider !== 'onedrive') dropFreshTokens(accountId);
}

/** The account's label, to show which one is linked; undefined when it cannot be read. */
export async function cloudAccountLabel(drive: CloudDrive): Promise<string | undefined> {
  try {
    return (await drive.account()).label;
  } catch {
    return undefined;
  }
}

/** Unlinking: MSAL forgets the Microsoft account; the others need nothing but the link going. */
export async function signOutOfCloud(provider: CloudProvider, accountId?: string): Promise<void> {
  if (provider === 'onedrive') await signOutOfOneDrive(accountId);
}

/** Leaves for the service's sign-in page; comes back to this page to continue `intent`. */
export async function signInToCloud(provider: CloudProvider, intent: string): Promise<void> {
  if (provider === 'onedrive') return signInToOneDrive(intent);
  const clientId = providerClientId(provider);
  if (!clientId) throw new CloudError('unexpected');
  await startOAuth({
    provider,
    intent,
    authorizeUrl: (challenge, state, redirectUri) =>
      provider === 'dropbox'
        ? dropboxAuthorizeUrl(clientId, challenge, state, redirectUri)
        : googleAuthorizeUrl(clientId, challenge, state, redirectUri),
  });
}

export type CloudSignIn =
  | { provider: CloudProvider; intent: string; accountId: string }
  | { provider: CloudProvider; intent: string; error: string };

/**
 * On start: finishes a sign-in that just came back. `oauth` is the PKCE return
 * (Dropbox, Google Drive); without it, a Microsoft one. Null when there was none.
 */
export async function completeCloudSignIn(oauth: OAuthReturn | null): Promise<CloudSignIn | null> {
  if (!oauth) {
    const microsoft = await completeOneDriveSignIn();
    return microsoft ? { provider: 'onedrive', ...microsoft } : null;
  }
  if ('error' in oauth) {
    return oauth.provider && oauth.intent
      ? { provider: oauth.provider, intent: oauth.intent, error: oauth.error }
      : null;
  }
  const { provider, intent } = oauth;
  try {
    const tokens: FreshTokens =
      provider === 'dropbox'
        ? await exchangeDropboxCode({
            appKey: providerClientId('dropbox'),
            code: oauth.code,
            verifier: oauth.verifier,
            redirectUri: oauth.redirectUri,
          })
        : await exchangeGoogleCode({
            serverUrl: GOOGLE_SERVER_URL,
            code: oauth.code,
            verifier: oauth.verifier,
            redirectUri: oauth.redirectUri,
          });
    return { provider, intent, accountId: holdFreshTokens({ provider, ...tokens }) };
  } catch (error) {
    return {
      provider,
      intent,
      error: error instanceof CloudError ? error.code : 'unexpected',
    };
  }
}
