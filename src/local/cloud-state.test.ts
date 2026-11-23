// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isLink } from './cloud-state';

const masterKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
  'encrypt',
  'decrypt',
]);
const base = { deviceId: 'd', keyId: 'k', masterKey };

describe('isLink', () => {
  it('takes a OneDrive link with or without its account (links saved before other services)', () => {
    expect(isLink({ ...base, provider: 'onedrive', accountId: 'a' })).toBe(true);
    expect(isLink({ ...base, provider: 'onedrive' })).toBe(true);
  });

  it('takes a Dropbox or Google Drive link only with its lasting link', () => {
    expect(isLink({ ...base, provider: 'dropbox', refreshToken: 'r' })).toBe(true);
    expect(isLink({ ...base, provider: 'gdrive', refreshToken: 'r' })).toBe(true);
    expect(isLink({ ...base, provider: 'gdrive' })).toBe(false);
    expect(isLink({ ...base, provider: 'dropbox', refreshToken: '' })).toBe(false);
  });

  it('refuses another service, or a link without its key', () => {
    expect(isLink({ ...base, provider: 'icloud', refreshToken: 'r' })).toBe(false);
    expect(isLink({ provider: 'onedrive', deviceId: 'd', keyId: 'k' })).toBe(false);
    expect(isLink(null)).toBe(false);
  });
});
