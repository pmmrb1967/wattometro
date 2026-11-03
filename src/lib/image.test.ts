// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { fitSize } from './image';

describe('fitSize', () => {
  it('shrinks a phone photo to what the AI reads without resizing it again', () => {
    const size = fitSize(4000, 3000);
    expect(size).toEqual({ width: 1238, height: 928 });
    expect(size.width * size.height).toBeLessThanOrEqual(1_150_000);
    expect(fitSize(3000, 4000)).toEqual({ width: 928, height: 1238 });
    // A long, thin table: its long side caps it first.
    expect(fitSize(4000, 500)).toEqual({ width: 1568, height: 196 });
  });

  it('leaves a small photo as it is', () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
