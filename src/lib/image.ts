// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Photos made small before they go to the AI: no larger than the API reads
 * them (it would shrink them itself, after the upload), and drawn again as
 * JPEG, which leaves out the camera's metadata (EXIF: place, date, device).
 */

/** The API's own limit: about 1.15 megapixels and 1568 px on the long side. */
const MAX_PIXELS = 1_150_000;
const MAX_SIDE = 1568;

export function fitSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(
    1,
    MAX_SIDE / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

export interface SmallPhoto {
  mime: 'image/jpeg';
  /** Standard base64, as the API takes it. */
  base64: string;
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/** A photo the browser can open, made small; null when it cannot open it. */
export async function shrinkPhoto(file: Blob): Promise<SmallPhoto | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });
  if (!blob) return null;
  const url = await dataUrl(blob);
  return { mime: 'image/jpeg', base64: url.slice(url.indexOf(',') + 1) };
}
