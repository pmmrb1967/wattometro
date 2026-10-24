// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { embedConfig } from './embed';

const SOURCE = readFileSync(join(__dirname, '..', '..', 'shelly', 'wattometro.js'), 'utf8');

describe('embedConfig', () => {
  it('writes the URL and token into the uploaded copy only, quoted', () => {
    const code = embedConfig(SOURCE, { url: 'https://x.test/v1/ingest', token: "a'b" });
    expect(code).toContain(`let INSTALLED = { url: "https://x.test/v1/ingest", token: "a'b" };`);
    expect(SOURCE).toContain("let INSTALLED = { url: '', token: '' };");
  });

  it('refuses a script without the marker', () => {
    expect(() => embedConfig('let x = 1;', { url: 'u', token: 't' })).toThrow();
  });
});
