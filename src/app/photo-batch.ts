// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The photos "Ler de fotografias" sends: a choice from the gallery replaces
 * those there were; a photo taken with the camera (one at a time) adds to them,
 * so the plate and the label can be taken one after the other.
 */
export type PhotoSource = 'choose' | 'camera';

/** The photos to send after a new pick, or null when that would pass `max`. */
export function nextPhotos<T>(
  current: readonly T[],
  added: readonly T[],
  source: PhotoSource,
  max: number,
): T[] | null {
  const photos = source === 'camera' ? [...current, ...added] : [...added];
  return photos.length > max ? null : photos;
}

/** A phone or a tablet: where a button can open the camera directly. */
export function hasCamera(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}
