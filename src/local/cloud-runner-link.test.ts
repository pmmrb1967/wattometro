// SPDX-License-Identifier: AGPL-3.0-or-later
/** The link the runner saves from a sign-in, for each service (the drives are mocked). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryDrive } from '../cloud/memory-drive';
import type { CloudProvider } from '../cloud/providers';

let drive = new MemoryDrive();
const forgetSignIn = vi.fn();
const signOutOfCloud = vi.fn(() => Promise.resolve());
vi.mock('../cloud/cloud-drives', () => ({
  signedInDrive: () => drive,
  linkedDrive: () => drive,
  signedInLink: (provider: CloudProvider, accountId: string) =>
    provider === 'onedrive' ? undefined : `refresh-${accountId}`,
  forgetSignIn,
  cloudAccountLabel: () => Promise.resolve('casa@example.com'),
  signOutOfCloud,
}));
vi.mock('./cloud-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cloud-state')>();
  return { ...actual, browserCloudLinkStore: actual.memoryCloudLinkStore() };
});
vi.mock('./store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store')>();
  return { ...actual, browserStore: actual.memoryStore(null) };
});
vi.mock('./server', () => ({
  localExclusive: <T>(task: () => Promise<T>) => task(),
  reloadLocal: () => undefined,
}));
vi.mock('./backup', () => ({ markBackup: () => undefined, markChanged: () => undefined }));

const { browserCloudLinkStore } = await import('./cloud-state');
const { cloudStatus, linkFirstDevice, relinkAccount, unlinkCloud } = await import('./cloud-runner');
const { resetSnapshotCache } = await import('./cloud-sync');

const PASSWORD = 'segredo-muito-forte';

async function linked() {
  const link = await browserCloudLinkStore.load();
  if (!link) throw new Error('not linked');
  return link;
}

beforeEach(async () => {
  vi.clearAllMocks();
  drive = new MemoryDrive();
  await browserCloudLinkStore.clear();
  resetSnapshotCache();
});

describe('linkFirstDevice', () => {
  it('a Dropbox link keeps the lasting link and no account id, then forgets the tab copy', async () => {
    await linkFirstDevice({ provider: 'dropbox', accountId: 'held-1' }, PASSWORD);
    const link = await linked();
    expect(link.provider).toBe('dropbox');
    expect(link.refreshToken).toBe('refresh-held-1');
    expect(link).not.toHaveProperty('accountId');
    expect(link.accountLabel).toBe('casa@example.com');
    expect(forgetSignIn).toHaveBeenCalledWith('dropbox', 'held-1');
  });

  it('a OneDrive link keeps the MSAL account and no lasting link', async () => {
    await linkFirstDevice({ provider: 'onedrive', accountId: 'msal-1' }, PASSWORD);
    const link = await linked();
    expect(link.provider).toBe('onedrive');
    expect(link.accountId).toBe('msal-1');
    expect(link).not.toHaveProperty('refreshToken');
    expect(await cloudStatus(() => true)).toMatchObject({ linked: true, provider: 'onedrive' });
  });
});

describe('relinkAccount', () => {
  beforeEach(async () => {
    await linkFirstDevice({ provider: 'dropbox', accountId: 'held-1' }, PASSWORD);
    await browserCloudLinkStore.save({ ...(await linked()), error: 'needs_reconnect' });
    vi.clearAllMocks();
  });

  it('follows a new sign-in to the same service and clears the error', async () => {
    await relinkAccount({ provider: 'dropbox', accountId: 'held-2' });
    const link = await linked();
    expect(link.refreshToken).toBe('refresh-held-2');
    expect(link.error).toBeUndefined();
    expect(forgetSignIn).toHaveBeenCalledWith('dropbox', 'held-2');
  });

  it('a sign-in to another service changes nothing', async () => {
    const before = await linked();
    await relinkAccount({ provider: 'gdrive', accountId: 'held-3' });
    await relinkAccount({ provider: 'onedrive', accountId: 'msal-1' });
    expect(await linked()).toEqual(before);
    expect(forgetSignIn).not.toHaveBeenCalled();
  });
});

describe('unlinkCloud', () => {
  it('forgets a Dropbox link with the link itself', async () => {
    await linkFirstDevice({ provider: 'dropbox', accountId: 'held-1' }, PASSWORD);
    expect(await unlinkCloud({ removeCloud: false })).toBe(true);
    expect(await browserCloudLinkStore.load()).toBeNull();
    expect(signOutOfCloud).toHaveBeenCalledWith('dropbox', undefined);
  });
});
