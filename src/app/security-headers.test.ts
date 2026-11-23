// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { AUTH_REDIRECT_PATH, contentSecurityPolicy, headersFile } from '../../security-headers';

function directive(name: string): string[] {
  const found = contentSecurityPolicy()
    .split('; ')
    .find((d) => d.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
}

describe('security headers', () => {
  it('connect-src lists the Microsoft, Dropbox and Google Drive hosts and nothing else new', () => {
    expect(directive('connect-src')).toEqual([
      "'self'",
      'https://api.anthropic.com',
      'https://generativelanguage.googleapis.com',
      'https://api.open-meteo.com',
      'https://archive-api.open-meteo.com',
      'https://geocoding-api.open-meteo.com',
      'https://login.microsoftonline.com',
      'https://graph.microsoft.com',
      'https://*.files.1drv.com',
      'https://*.livefilestore.com',
      'https://my.microsoftpersonalcontent.com',
      'https://*.sharepoint.com',
      'https://api.dropboxapi.com',
      'https://content.dropboxapi.com',
      'https://www.googleapis.com',
    ]);
  });

  it('frame-src allows only self and Microsoft sign-in', () => {
    expect(directive('frame-src')).toEqual(["'self'", 'https://login.microsoftonline.com']);
  });

  it('lets the sign-in return page be framed by the app only', () => {
    expect(AUTH_REDIRECT_PATH).toBe('/auth-redirect.html');
    expect(headersFile()).toContain(`${AUTH_REDIRECT_PATH}\n  ! Content-Security-Policy`);
    expect(contentSecurityPolicy("'self'")).toContain("frame-ancestors 'self'");
  });
});
