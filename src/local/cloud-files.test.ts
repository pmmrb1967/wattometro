// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MemoryDrive } from '../cloud/memory-drive';
import { emptyLocalData } from './data';
import { emptyMeta } from './meta';
import {
  backupName,
  CloudKeyError,
  createKeyFile,
  decodeHouse,
  encodeHouse,
  housePath,
  KEY_FILE,
  parseBackupName,
  readKeyFile,
  unlockKeyFile,
  type HousePayload,
} from './cloud-files';

const ITER = 1_000;
const payload = (): HousePayload => ({
  version: emptyLocalData().version,
  deviceId: 'dev-1',
  writtenAt: 1_700_000_000,
  data: emptyLocalData(),
  meta: emptyMeta(),
});

describe('key file', () => {
  it('createKeyFile then unlockKeyFile with the password', async () => {
    const drive = new MemoryDrive();
    const created = await createKeyFile(drive, 'segredo', ITER);
    expect(drive.files.has(KEY_FILE)).toBe(true);
    expect((await readKeyFile(drive))?.keyId).toBe(created.keyId);
    const key = await unlockKeyFile(drive, { password: 'segredo' });
    expect(key.keyId).toBe(created.keyId);
    expect(key.masterKey.extractable).toBe(false);
  });

  it('unlock with the recovery key', async () => {
    const drive = new MemoryDrive();
    const created = await createKeyFile(drive, 'segredo', ITER);
    const key = await unlockKeyFile(drive, { recoveryKey: created.recoveryKey });
    expect(key.keyId).toBe(created.keyId);
  });

  it('wrong password is wrong_secret', async () => {
    const drive = new MemoryDrive();
    await createKeyFile(drive, 'segredo', ITER);
    await expect(unlockKeyFile(drive, { password: 'outro' })).rejects.toMatchObject({
      code: 'wrong_secret',
    });
  });

  it('missing file is missing', async () => {
    await expect(unlockKeyFile(new MemoryDrive(), { password: 'x' })).rejects.toBeInstanceOf(
      CloudKeyError,
    );
    expect(await readKeyFile(new MemoryDrive())).toBeNull();
  });

  it('createKeyFile never overwrites an existing chave.json', async () => {
    const drive = new MemoryDrive();
    await createKeyFile(drive, 'segredo', ITER);
    const before = drive.files.get(KEY_FILE)?.bytes;
    await expect(createKeyFile(drive, 'outra', ITER)).rejects.toMatchObject({ code: 'exists' });
    expect(drive.files.get(KEY_FILE)?.bytes).toEqual(before);
  });
});

describe('house file', () => {
  it('encode/decode round trip', async () => {
    const key = await createKeyFile(new MemoryDrive(), 'x', ITER);
    const bytes = await encodeHouse(key, payload());
    const result = await decodeHouse(key, bytes);
    expect(result).toEqual({ kind: 'ok', payload: payload() });
    expect(housePath('dev-1')).toBe('casas/dev-1.bin');
  });

  it('other keyId is other_key without decrypting', async () => {
    const a = await createKeyFile(new MemoryDrive(), 'x', ITER);
    const b = await createKeyFile(new MemoryDrive(), 'x', ITER);
    const bytes = await encodeHouse(a, payload());
    expect(await decodeHouse(b, bytes)).toEqual({ kind: 'other_key' });
  });

  it('newer version is newer', async () => {
    const key = await createKeyFile(new MemoryDrive(), 'x', ITER);
    const bytes = await encodeHouse(key, { ...payload(), version: 99 });
    expect(await decodeHouse(key, bytes)).toEqual({ kind: 'newer', version: 99 });
  });

  it('newer version with a meta of another shape is still newer', async () => {
    const key = await createKeyFile(new MemoryDrive(), 'x', ITER);
    const future = { ...payload(), version: emptyLocalData().version + 1, meta: { other: 1 } };
    const bytes = await encodeHouse(key, future as unknown as HousePayload);
    expect(await decodeHouse(key, bytes)).toEqual({
      kind: 'newer',
      version: emptyLocalData().version + 1,
    });
  });

  it('corrupt blob is unreadable', async () => {
    const key = await createKeyFile(new MemoryDrive(), 'x', ITER);
    const header = JSON.parse(new TextDecoder().decode(await encodeHouse(key, payload())));
    header.blob.data = 'AAAA' + header.blob.data.slice(4);
    const bytes = new TextEncoder().encode(JSON.stringify(header));
    expect(await decodeHouse(key, bytes)).toEqual({ kind: 'unreadable' });
    expect(await decodeHouse(key, new TextEncoder().encode('nope'))).toEqual({
      kind: 'unreadable',
    });
  });
});

describe('backup names', () => {
  it('parseBackupName ignores files not made by the app', () => {
    expect(parseBackupName('notas.txt')).toBeNull();
    expect(parseBackupName('wattometro-2026-11-22.bin')).toBeNull();
    expect(parseBackupName('wattometro-2026-11-22-1a2b3c4d.bin')).toEqual({ day: '2026-11-22' });
    expect(parseBackupName(backupName('2026-11-22', '1a2b3c4d-ffff'))).toEqual({
      day: '2026-11-22',
    });
  });
});
