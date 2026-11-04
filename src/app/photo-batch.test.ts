// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { nextPhotos } from './photo-batch';

describe('nextPhotos', () => {
  it('replaces what was there with a choice from the gallery', () => {
    expect(nextPhotos(['a'], ['b', 'c'], 'choose', 3)).toEqual(['b', 'c']);
  });

  it('adds a photo taken with the camera to those taken before', () => {
    expect(nextPhotos(['a', 'b'], ['c'], 'camera', 3)).toEqual(['a', 'b', 'c']);
  });

  it('refuses more than the limit, either way', () => {
    expect(nextPhotos([], ['a', 'b', 'c', 'd'], 'choose', 3)).toBeNull();
    expect(nextPhotos(['a', 'b', 'c'], ['d'], 'camera', 3)).toBeNull();
  });
});
