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
vi.mock('../cloud/oauth', () => ({ takeOAuthReturn, CLOUD_RETURN_PATH: '/nuvem-retorno' }));
vi.mock('../cloud/providers', () => ({
  cloudAvailable: () => offered.size > 0,
  providerAvailable: (provider: CloudProvider) => offered.has(provider),
}));

const replaceState = vi.fn();
const location = { href: 'https://app.example/definicoes', pathname: '/definicoes' };
vi.stubGlobal('window', { location, history: { replaceState } });

const { clearCloudReturn, startCloudReturn, takeCloudFailure, takeCloudReturn } =
  await import('./cloud-return');

beforeEach(() => {
  vi.clearAllMocks();
  location.href = 'https://app.example/definicoes';
  location.pathname = '/definicoes';
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

describe('the return address', () => {
  beforeEach(() => {
    location.href = 'https://app.example/nuvem-retorno?code=c&state=s';
    location.pathname = '/nuvem-retorno';
  });

  it('is replaced by the start page when the return cannot be read', () => {
    takeOAuthReturn.mockImplementation(() => {
      throw new Error('no sessionStorage');
    });
    startCloudReturn();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('is replaced by the start page where no service is offered', () => {
    offered.clear();
    startCloudReturn();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('is left alone on any other page', () => {
    location.pathname = '/definicoes';
    startCloudReturn();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('takeCloudFailure', () => {
  it('gives the service of a failed sign-in for its intent, until the flow takes it', async () => {
    completeCloudSignIn.mockResolvedValue({ provider: 'dropbox', intent: 'connect', error: 'x' });
    startCloudReturn();
    expect(await takeCloudFailure('reconnect')).toBeNull();
    expect(await takeCloudFailure('connect')).toBe('dropbox');
    expect(await takeCloudFailure('connect')).toBe('dropbox');
    clearCloudReturn('connect');
    expect(await takeCloudFailure('connect')).toBeNull();
  });

  it('stays silent when the user cancelled', async () => {
    completeCloudSignIn.mockResolvedValue({
      provider: 'dropbox',
      intent: 'connect',
      error: 'access_denied',
    });
    startCloudReturn();
    expect(await takeCloudFailure('connect')).toBeNull();
  });

  it('gives nothing for a sign-in that worked', async () => {
    startCloudReturn();
    expect(await takeCloudFailure('connect')).toBeNull();
  });
});
