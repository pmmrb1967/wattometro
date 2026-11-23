// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The files of the cloud folder (Pasta Aplicações/Wattómetro): `chave.json`
 * with the wrapped master key, one encrypted file per device in `casas/`, and
 * the dated backups in `copias/`. Only the header of a house file (format,
 * keyId) is plain; the house and its change stamps are encrypted.
 */
import { z } from 'zod';
import { CloudError, readJson, writeJson, type CloudDrive } from '../cloud/drive';
import {
  createAccountKeys,
  decryptJson,
  encryptJson,
  nonExtractable,
  unlockWithPassword,
  unlockWithRecoveryKey,
  WrongSecretError,
  type EncryptedBlob,
  type WrappedMasterKey,
} from '../lib/crypto';
import { LOCAL_VERSION, type LocalData } from './data';
import { syncMetaSchema, type SyncMeta } from './meta';
import { readStored } from './stored';

export const KEY_FILE = 'chave.json';
export const HOUSES_FOLDER = 'casas';
export const BACKUPS_FOLDER = 'copias';

const KEY_FORMAT = 'wattometro-cloud-key';
const HOUSE_FORMAT = 'wattometro-local-house';

export interface CloudKey {
  keyId: string;
  masterKey: CryptoKey;
}

export type CloudKeyErrorCode = 'exists' | 'missing' | 'wrong_secret';

export class CloudKeyError extends Error {
  readonly code: CloudKeyErrorCode;
  constructor(code: CloudKeyErrorCode) {
    super(code);
    this.name = 'CloudKeyError';
    this.code = code;
  }
}

const blobSchema = z.object({ iv: z.string().max(100), data: z.string().max(100_000_000) });
const keyFileSchema = z.object({
  format: z.literal(KEY_FORMAT),
  version: z.literal(1),
  keyId: z.string().min(1).max(100),
  wrappedKey: z.object({
    byPassword: blobSchema,
    kdf: z.object({
      algorithm: z.literal('PBKDF2-SHA256'),
      iterations: z.number().int().positive().max(10_000_000),
      salt: z.string().max(100),
    }),
    byRecoveryKey: blobSchema,
    recoverySalt: z.string().max(100),
  }),
});

export async function createKeyFile(
  drive: CloudDrive,
  password: string,
  iterations?: number,
): Promise<CloudKey & { recoveryKey: string }> {
  const { masterKey, wrapped, recoveryKey } = await createAccountKeys(password, iterations);
  const keyId = crypto.randomUUID();
  const file: z.infer<typeof keyFileSchema> = {
    format: KEY_FORMAT,
    version: 1,
    keyId,
    wrappedKey: wrapped,
  };
  try {
    await writeJson(drive, KEY_FILE, file, { ifNoneMatch: '*' });
  } catch (error) {
    if (error instanceof CloudError && error.code === 'conflict') throw new CloudKeyError('exists');
    throw error;
  }
  return { keyId, masterKey: await nonExtractable(masterKey), recoveryKey };
}

export async function readKeyFile(
  drive: CloudDrive,
): Promise<{ keyId: string; wrappedKey: WrappedMasterKey } | null> {
  const file = await readJson(drive, KEY_FILE, keyFileSchema);
  return file === null ? null : { keyId: file.keyId, wrappedKey: file.wrappedKey };
}

export async function unlockKeyFile(
  drive: CloudDrive,
  secret: { password: string } | { recoveryKey: string },
): Promise<CloudKey> {
  const file = await readKeyFile(drive);
  if (file === null) throw new CloudKeyError('missing');
  try {
    const masterKey =
      'password' in secret
        ? await unlockWithPassword(file.wrappedKey, secret.password)
        : await unlockWithRecoveryKey(file.wrappedKey, secret.recoveryKey);
    return { keyId: file.keyId, masterKey: await nonExtractable(masterKey) };
  } catch (error) {
    if (error instanceof WrongSecretError) throw new CloudKeyError('wrong_secret');
    throw error;
  }
}

export interface HousePayload {
  version: number;
  deviceId: string;
  writtenAt: number;
  data: LocalData;
  meta: SyncMeta;
}

const headerSchema = z.object({
  format: z.literal(HOUSE_FORMAT),
  keyId: z.string().max(100),
  blob: blobSchema,
});

const versionSchema = z.looseObject({ version: z.number().int().min(1) });

const envelopeSchema = z.object({
  version: z.number().int().min(1),
  deviceId: z.string().min(1).max(200),
  writtenAt: z.number().int().min(0),
  meta: syncMetaSchema,
  data: z.unknown(),
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encodeHouse(key: CloudKey, payload: HousePayload): Promise<Uint8Array> {
  const blob: EncryptedBlob = await encryptJson(key.masterKey, payload);
  return encoder.encode(JSON.stringify({ format: HOUSE_FORMAT, keyId: key.keyId, blob }));
}

export type DecodedHouse =
  | { kind: 'ok'; payload: HousePayload }
  | { kind: 'other_key' }
  | { kind: 'newer'; version: number }
  | { kind: 'unreadable' };

export async function decodeHouse(key: CloudKey, bytes: Uint8Array): Promise<DecodedHouse> {
  let header: z.infer<typeof headerSchema>;
  try {
    header = headerSchema.parse(JSON.parse(decoder.decode(bytes)));
  } catch {
    return { kind: 'unreadable' };
  }
  if (header.keyId !== key.keyId) return { kind: 'other_key' };
  let plain: unknown;
  try {
    plain = await decryptJson(key.masterKey, header.blob);
  } catch {
    return { kind: 'unreadable' };
  }
  // The version first: a newer format may change the rest of the envelope.
  const versioned = versionSchema.safeParse(plain);
  if (!versioned.success) return { kind: 'unreadable' };
  if (versioned.data.version > LOCAL_VERSION) {
    return { kind: 'newer', version: versioned.data.version };
  }
  const envelope = envelopeSchema.safeParse(plain);
  if (!envelope.success) return { kind: 'unreadable' };
  const { version, deviceId, writtenAt, meta, data } = envelope.data;
  const stored = readStored(data);
  if (stored.kind !== 'ok') return { kind: 'unreadable' };
  return { kind: 'ok', payload: { version, deviceId, writtenAt, data: stored.data, meta } };
}

export const housePath = (deviceId: string): string => `${HOUSES_FOLDER}/${deviceId}.bin`;

const BACKUP_PATTERN = /^wattometro-(\d{4}-\d{2}-\d{2})-[a-z0-9]{8}\.bin$/;

/** `day` is AAAA-MM-DD; the first 8 letters or digits of the device id tell devices apart. */
export function backupName(day: string, deviceId: string): string {
  const short = deviceId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8)
    .padEnd(8, '0');
  return `wattometro-${day}-${short}.bin`;
}

export function parseBackupName(name: string): { day: string } | null {
  const match = BACKUP_PATTERN.exec(name);
  return match?.[1] ? { day: match[1] } : null;
}
