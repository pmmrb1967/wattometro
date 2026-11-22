// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeOneDriveSignIn = vi.fn();
vi.mock('../cloud/onedrive-auth', () => ({ completeOneDriveSignIn }));
vi.mock('../cloud/providers', () => ({ oneDriveAvailable: () => true }));

const { clearCloudReturn, startCloudReturn, takeCloudReturn } = await import('./cloud-return');

describe('takeCloudReturn', () => {
  beforeEach(() => {
    completeOneDriveSignIn.mockResolvedValue({ intent: 'connect', accountId: 'account-1' });
    startCloudReturn();
  });

  it('gives the same sign-in on repeat calls for its intent (StrictMode runs effects twice)', async () => {
    expect(await takeCloudReturn('connect')).toEqual({ accountId: 'account-1' });
    expect(await takeCloudReturn('connect')).toEqual({ accountId: 'account-1' });
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
    completeOneDriveSignIn.mockResolvedValue({ intent: 'join', accountId: 'account-2' });
    startCloudReturn();
    expect(await takeCloudReturn('connect')).toBeNull();
    expect(await takeCloudReturn('join')).toEqual({ accountId: 'account-2' });
    clearCloudReturn('join');
    expect(await takeCloudReturn('join')).toBeNull();
  });

  it('gives nothing when no sign-in came back', async () => {
    completeOneDriveSignIn.mockResolvedValue(null);
    startCloudReturn();
    expect(await takeCloudReturn('connect')).toBeNull();
  });
});
