// SPDX-License-Identifier: AGPL-3.0-or-later
/** Hands the browser a JSON file to save (the local mode's copies). */
export function download(content: unknown, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
