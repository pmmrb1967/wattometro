// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where the household copy goes: a folder chosen once (the File System Access
 * API: Chrome and Edge on a computer), kept in this browser; elsewhere, the
 * browser's downloads. The browser only tells the folder's name, never its
 * path. Writing goes to a temporary file that replaces the copy only when
 * complete, so a syncing cloud client never takes half a copy.
 */
import { readKept, writeKept } from './kept';

type Permission = 'granted' | 'denied' | 'prompt';
interface PermissionedHandle extends FileSystemDirectoryHandle {
  queryPermission?(options: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<Permission>;
}
type DirectoryPicker = (options: {
  id?: string;
  mode?: 'readwrite';
  startIn?: 'documents';
}) => Promise<FileSystemDirectoryHandle>;

const picker = (): DirectoryPicker | null => {
  const candidate = (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  return typeof candidate === 'function' ? candidate.bind(globalThis) : null;
};

/** Whether this browser lets the app write into a folder the user chooses. */
export const canChooseFolder = () => picker() !== null;

/** The folder kept in this browser, if any. */
export async function keptFolder(): Promise<FileSystemDirectoryHandle | null> {
  return canChooseFolder() ? readKept<FileSystemDirectoryHandle>('folder') : null;
}

/** Asks for a folder; null when the user closes the picker. Kept for the next copies. */
export async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  const show = picker();
  if (!show) return null;
  try {
    const folder = await show({ id: 'wattometro-copias', mode: 'readwrite', startIn: 'documents' });
    await writeKept('folder', folder);
    return folder;
  } catch {
    return null;
  }
}

/**
 * Whether the app may write in the folder now; asks when needed. Called first
 * in the click, while the browser still counts it as the user's gesture.
 */
export async function mayWrite(folder: FileSystemDirectoryHandle): Promise<boolean> {
  const handle = folder as PermissionedHandle;
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

export async function writeInFolder(
  folder: FileSystemDirectoryHandle,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const file = await folder.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(bytes);
  await writable.close();
}

/** Hands the browser the file to save (its downloads). */
export function downloadFile(name: string, bytes: Uint8Array<ArrayBuffer>): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start the download after this tick.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
