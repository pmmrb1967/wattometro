// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Weighted least squares by the normal equations (XᵀWX β = XᵀWy), solved by
 * Gaussian elimination with partial pivoting. Small problems only (a handful
 * of columns, a few hundred rows), as in the bill forecast.
 */

/** Coefficients β, or null when the columns are not independent (e.g. a column of zeros). */
export function weightedLeastSquares(
  rows: readonly (readonly number[])[],
  y: readonly number[],
  weights: readonly number[],
): number[] | null {
  const k = rows[0]?.length ?? 0;
  if (k === 0 || rows.length < k) return null;
  // Augmented matrix [XᵀWX | XᵀWy].
  const a = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  rows.forEach((row, index) => {
    const w = weights[index] ?? 0;
    const target = y[index] ?? 0;
    for (let i = 0; i < k; i++) {
      const wx = w * (row[i] ?? 0);
      const line = a[i]!;
      for (let j = 0; j < k; j++) line[j]! += wx * (row[j] ?? 0);
      line[k]! += wx * target;
    }
  });
  const scale = Math.max(...a.map((line, i) => Math.abs(line[i]!)), 1e-300);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < scale * 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    const line = a[col]!;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const other = a[r]!;
      const factor = other[col]! / line[col]!;
      if (factor === 0) continue;
      for (let j = col; j <= k; j++) other[j]! -= factor * line[j]!;
    }
  }
  return a.map((line, i) => line[k]! / line[i]!);
}
