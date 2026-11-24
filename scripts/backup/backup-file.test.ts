// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  BackupFileError,
  backupName,
  backupsToRemove,
  openBackup,
  sealBackup,
} from './backup-file';

// Few iterations: the format is the same, the test is fast.
const FAST = 1_000;
const SQL = Buffer.from("CREATE TABLE t (x);\nINSERT INTO t VALUES ('olá');\n".repeat(50));

describe('sealBackup / openBackup', () => {
  it('gives back the same SQL with the right password', () => {
    const sealed = sealBackup(SQL, 'uma palavra-passe longa', FAST);
    expect(sealed.subarray(0, 4).toString('ascii')).toBe('WMBK');
    expect(sealed.includes(Buffer.from('CREATE TABLE'))).toBe(false);
    expect(openBackup(sealed, 'uma palavra-passe longa').equals(SQL)).toBe(true);
  });

  it('refuses a wrong password, a changed byte and a changed header', () => {
    const sealed = sealBackup(SQL, 'uma palavra-passe longa', FAST);
    expect(() => openBackup(sealed, 'outra palavra-passe')).toThrow(BackupFileError);
    const body = Buffer.from(sealed);
    body[body.length - 20]! ^= 1;
    expect(() => openBackup(body, 'uma palavra-passe longa')).toThrow(BackupFileError);
    const header = Buffer.from(sealed);
    header.writeUInt32BE(FAST + 1, 5);
    expect(() => openBackup(header, 'uma palavra-passe longa')).toThrow(BackupFileError);
  });

  it('refuses a file that is not a backup', () => {
    expect(() => openBackup(Buffer.from('CREATE TABLE t (x);'), 'x')).toThrow(
      'Não é um ficheiro de cópia do Wattómetro.',
    );
  });
});

describe('backupName / backupsToRemove', () => {
  it('names a copy by its UTC minute', () => {
    expect(backupName(new Date('2026-11-24T04:05:59Z'))).toBe(
      'wattometro-2026-11-24T0405Z.sql.gz.enc',
    );
  });

  it('removes the oldest past `keep`, and only this script’s files', () => {
    const names = [
      'wattometro-2026-11-03T0400Z.sql.gz.enc',
      'wattometro-2026-11-17T0400Z.sql.gz.enc',
      'notas.txt',
      'wattometro-2026-11-10T0400Z.sql.gz.enc',
      'wattometro-2026-11-24T0400Z.sql.gz.enc.part',
    ];
    expect(backupsToRemove(names, 2)).toEqual(['wattometro-2026-11-03T0400Z.sql.gz.enc']);
    expect(backupsToRemove(names, 0)).toEqual([
      'wattometro-2026-11-10T0400Z.sql.gz.enc',
      'wattometro-2026-11-03T0400Z.sql.gz.enc',
    ]);
  });
});
