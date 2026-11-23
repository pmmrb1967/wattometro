// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';

const startCloudReturn = vi.fn();
vi.mock('../local/cloud-return', () => ({ startCloudReturn }));

describe('cloud-return-start', () => {
  it('starts the cloud return as a side effect of being imported', async () => {
    await import('./cloud-return-start');
    expect(startCloudReturn).toHaveBeenCalledOnce();
  });
});
