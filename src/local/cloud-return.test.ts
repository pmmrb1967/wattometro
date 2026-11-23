// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudSignIn } from '../cloud/cloud-drives';
import type { OAuthReturn } from '../cloud/oauth';
import type { CloudProvider } from '../cloud/providers';

const completeCloudSignIn = vi.fn<(oauth: OAuthReturn | null) => Promise<CloudSignIn | null>>();
const takeOAuthReturn = vi.fn<(url: URL) => OAuthReturn | null>();
const dropAllFreshTokens = vi.fn();
const offered = new Set<CloudProvider>(['onedrive', 'dropbox']);
vi.mock('../cloud/cloud-drives', () => ({ completeCloudSignIn }));
vi.mock('../cloud/cloud-tokens', () => ({ dropAllFreshTokens }));
vi.mock('../cloud/oauth', () => ({ takeOAuthReturn }));
vi.mock('../cloud/providers', () => ({
  cloudAvailable: () => offered.size > 0,
  providerAvailable: (provider: CloudProvider) => offered.has(provider),
}));

const replaceState = vi.fn();
vi.stubGlobal('window', {
  location: { href: 'https://app.example/definicoes' },
  history: { replaceState },
});

const { clearCloudReturn, startCloudReturn, takeCloudReturn } = await import('./cloud-return');

beforeEach(() => {
  vi.clearAllMocks();
  offered.clear();
  offered.add('onedrive');
  offered.add('dropbox');
  takeOAuthReturn.mockReturnValue(null);
  completeCloudSignIn.mockResolvedValue({
    provider: 'onedrive',
    intent: 'connect',
    accountId: 'account-1',
  });
});

describe('takeCloudReturn', () => {
  beforeEach(() => {
    startCloudReturn();
  });

  it('gives the same sign-in on repeat calls for its intent (StrictMode runs effects twice)', async () => {
    const back = { provider: 'onedrive', accountId: 'account-1' };
    expect(await takeCloudReturn('connect')).toEqual(back);
    expect(await takeCloudReturn('connect')).toEqual(back);
  });

  it('gives nothing to another intent', async () => {
    expect(await takeCloudReturn('reconnect')).toBeNull();
  });

  it('gives nothing once the flow has taken it', async () => {
    expect(await takeCloudReturn('connect')).not.toBeNull();
    clearCloudReturn('connect');
    expect(await takeCloudReturn('connect')).toBeNull();
  });

  it('gives the landing page its own join intent only', async () => {
    completeCloudSignIn.mockResolvedValue({
      provider: 'onedrive',
      intent: 'join',
      accountId: 'account-2',
    });
    startCloudReturn();
    expect(await takeCloudReturn('connect')).toBeNull();
    expect(await takeCloudReturn('join')).toEqual({ provider: 'onedrive', accountId: 'account-2' });
    clearCloudReturn('join');
    expect(await takeCloudReturn('join')).toBeNull();
  });

  it('gives nothing when no sign-in came back', async () => {
    completeCloudSignIn.mockResolvedValue(null);
    startCloudReturn();
    expect(await takeCloudReturn('connect')).toBeNull();
  });

  it('gives nothing for a refused sign-in', async () => {
    completeCloudSignIn.mockResolvedValue({ provider: 'dropbox', intent: 'connect', error: 'x' });
    startCloudReturn();
    expect(await takeCloudReturn('connect')).toBeNull();
  });
});

describe('startCloudReturn', () => {
  it('finishes a Dropbox return and puts the address back to the page that left', async () => {
    const oauth: OAuthReturn = {
      provider: 'dropbox',
      intent: 'reconnect',
      verifier: 'v',
      returnTo: '/energia?x=1',
      redirectUri: 'https://app.example/nuvem-retorno',
      code: 'c',
    };
    takeOAuthReturn.mockReturnValue(oauth);
    completeCloudSignIn.mockResolvedValue({
      provider: 'dropbox',
      intent: 'reconnect',
      accountId: 'held-1',
    });
    startCloudReturn();
    expect(dropAllFreshTokens).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/energia?x=1');
    expect(completeCloudSignIn).toHaveBeenCalledWith(oauth);
    expect(await takeCloudReturn('reconnect')).toEqual({
      provider: 'dropbox',
      accountId: 'held-1',
    });
  });

  it('a return this tab lost goes to the start page and gives nothing', async () => {
    takeOAuthReturn.mockReturnValue({ error: 'no_pending' });
    completeCloudSignIn.mockResolvedValue(null);
    startCloudReturn();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    for (const intent of ['connect', 'reconnect', 'join'] as const) {
      expect(await takeCloudReturn(intent)).toBeNull();
    }
  });

  it('does not ask MSAL where OneDrive is not offered', async () => {
    offered.delete('onedrive');
    startCloudReturn();
    expect(completeCloudSignIn).not.toHaveBeenCalled();
    expect(await takeCloudReturn('connect')).toBeNull();
  });

  it('does nothing where no service is offered', () => {
    offered.clear();
    startCloudReturn();
    expect(dropAllFreshTokens).not.toHaveBeenCalled();
    expect(takeOAuthReturn).not.toHaveBeenCalled();
    expect(completeCloudSignIn).not.toHaveBeenCalled();
  });
});
