// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The administrator's D1 backup file (pnpm db:backup, docs/admin.md): the
 * `wrangler d1 export` SQL, gzipped and sealed with a password (PBKDF2-SHA256
 * → AES-256-GCM), and which old copies to remove.
 *
 * Layout: "WMBK" · version (1 byte) · PBKDF2 iterations (uint32, big-endian)
 * · salt (16) · IV (12) · ciphertext · GCM tag (16).
 */
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const MAGIC = Buffer.from('WMBK', 'ascii');
const VERSION = 1;
/** OWASP's figure for PBKDF2-SHA256 (2023). */
export const ITERATIONS = 600_000;
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + 1 + 4 + SALT + IV;
export const MIN_BACKUP_PASSWORD_LENGTH = 12;

export class BackupFileError extends Error {}

function keyFor(password: string, salt: Buffer, iterations: number): Buffer {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

export function sealBackup(sql: Buffer, password: string, iterations = ITERATIONS): Buffer {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const header = Buffer.alloc(HEADER);
  MAGIC.copy(header, 0);
  header.writeUInt8(VERSION, 4);
  header.writeUInt32BE(iterations, 5);
  salt.copy(header, 9);
  iv.copy(header, 9 + SALT);
  const cipher = createCipheriv('aes-256-gcm', keyFor(password, salt, iterations), iv);
  // The header is authenticated too: a changed iteration count fails like a wrong password.
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(gzipSync(sql)), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

export function openBackup(file: Buffer, password: string): Buffer {
  if (file.length < HEADER + TAG || !file.subarray(0, 4).equals(MAGIC)) {
    throw new BackupFileError('Não é um ficheiro de cópia do Wattómetro.');
  }
  if (file.readUInt8(4) !== VERSION) {
    throw new BackupFileError('Cópia de uma versão desconhecida do formato.');
  }
  const header = file.subarray(0, HEADER);
  const iterations = file.readUInt32BE(5);
  const salt = file.subarray(9, 9 + SALT);
  const iv = file.subarray(9 + SALT, HEADER);
  const decipher = createDecipheriv('aes-256-gcm', keyFor(password, salt, iterations), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(file.subarray(file.length - TAG));
  let zipped: Buffer;
  try {
    zipped = Buffer.concat([
      decipher.update(file.subarray(HEADER, file.length - TAG)),
      decipher.final(),
    ]);
  } catch {
    throw new BackupFileError('Palavra-passe errada ou ficheiro danificado.');
  }
  return gunzipSync(zipped);
}

const NAME = /^wattometro-\d{4}-\d{2}-\d{2}T\d{4}Z\.sql\.gz\.enc$/;

/** "wattometro-2026-11-24T0400Z.sql.gz.enc": UTC, so names sort by time. */
export function backupName(at: Date): string {
  const iso = at.toISOString(); // 2026-11-24T04:00:00.000Z
  return `wattometro-${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z.sql.gz.enc`;
}

/** The copies past the newest `keep`, among this script's files only. */
export function backupsToRemove(names: readonly string[], keep: number): string[] {
  return names
    .filter((name) => NAME.test(name))
    .sort()
    .reverse()
    .slice(Math.max(1, keep));
}
