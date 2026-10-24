// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { weightedLeastSquares } from './regression';

describe('weightedLeastSquares', () => {
  it('recovers an exact line: y = 2 + 3x', () => {
    const rows = [0, 1, 2, 3].map((x) => [1, x]);
    const beta = weightedLeastSquares(rows, [2, 5, 8, 11], [1, 1, 1, 1]);
    expect(beta?.[0]).toBeCloseTo(2, 10);
    expect(beta?.[1]).toBeCloseTo(3, 10);
  });

  it('a mean when there is only an intercept; weights move it', () => {
    // Weighted mean of 10 and 20 with weights 3 and 1 = 12.5.
    expect(weightedLeastSquares([[1], [1]], [10, 20], [3, 1])?.[0]).toBeCloseTo(12.5, 10);
  });

  it('by hand: y at x = 0, 1, 2 is 1, 2, 4 → β = (5/6, 3/2)', () => {
    // XᵀX = [[3, 3], [3, 5]], Xᵀy = [7, 10] → β1 = 3/2, β0 = (7 − 4.5)/3 = 5/6.
    const beta = weightedLeastSquares(
      [
        [1, 0],
        [1, 1],
        [1, 2],
      ],
      [1, 2, 4],
      [1, 1, 1],
    );
    expect(beta?.[0]).toBeCloseTo(5 / 6, 10);
    expect(beta?.[1]).toBeCloseTo(1.5, 10);
  });

  it('null for dependent columns or too few rows', () => {
    expect(
      weightedLeastSquares(
        [
          [1, 0],
          [1, 0],
          [1, 0],
        ],
        [1, 2, 3],
        [1, 1, 1],
      ),
    ).toBeNull();
    expect(weightedLeastSquares([[1, 2]], [1], [1])).toBeNull();
    expect(weightedLeastSquares([], [], [])).toBeNull();
  });
});
