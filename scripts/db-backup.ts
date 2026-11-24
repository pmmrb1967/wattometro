// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The administrator's copy of the whole D1 database (docs/admin.md, "Cópias da
 * base de dados"): `wrangler d1 export --remote`, gzipped and sealed with a
 * password, into a folder of this computer (one synced by OneDrive, Google
 * Drive or Dropbox puts it in the cloud too). Keeps the newest BACKUP_KEEP.
 * Then records the time in D1 (maintenance_state), for the administrator's
 * panel and the "late copy" alert (server/src/alerts.ts, decideBackup).
 *
 *   pnpm db:backup                          # a new copy (BACKUP_DIR, BACKUP_PASSWORD in .env)
 *   pnpm db:backup --decrypt <file> [--out <file.sql>]   # the SQL back, to restore
 *
 * The export locks the database while it runs (Cloudflare's docs): the Shelly
 * sends that minute again later, as after any failure.
 */
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  BackupFileError,
  backupName,
  backupsToRemove,
  MIN_BACKUP_PASSWORD_LENGTH,
  openBackup,
  sealBackup,
} from './backup/backup-file';
import { STATE } from '../server/src/rollups';
import { parseEnv } from './shelly/rpc';

const DATABASE = 'wattometro';
const CONFIG = 'server/wrangler.toml';
const DEFAULT_KEEP = 8;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const envPath = resolve('.env');
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const password = env.BACKUP_PASSWORD || fail('Falta BACKUP_PASSWORD no .env (ver .env.example).');
if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
  fail(`BACKUP_PASSWORD tem de ter pelo menos ${MIN_BACKUP_PASSWORD_LENGTH} caracteres.`);
}

function argument(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

if (process.argv.includes('--decrypt')) {
  const file = argument('--decrypt') ?? fail('Indica o ficheiro: --decrypt <ficheiro>.');
  // By default outside the repository (it is public): the system's temporary folder.
  const out =
    argument('--out') ?? join(tmpdir(), basename(file).replace(/\.gz\.enc$/, '') || 'copia.sql');
  try {
    writeFileSync(out, openBackup(readFileSync(file), password));
  } catch (error) {
    fail(error instanceof BackupFileError ? error.message : String(error));
  }
  console.log(`SQL em ${out}. Para repor, vê docs/admin.md; apaga-o depois.`);
  process.exit(0);
}

const folder = env.BACKUP_DIR || fail('Falta BACKUP_DIR no .env (ver .env.example).');
if (!existsSync(folder)) fail(`A pasta ${folder} não existe.`);
const keep = env.BACKUP_KEEP ? Number(env.BACKUP_KEEP) : DEFAULT_KEEP;
if (!Number.isInteger(keep) || keep < 1) fail('BACKUP_KEEP tem de ser um número inteiro ≥ 1.');

/** The copy's time in D1, for the panel and the alert; a failure here keeps the copy. */
function recordBackup(at: number): void {
  const sql =
    `INSERT INTO maintenance_state (name, value) VALUES ('${STATE.backupAt}', ${at}) ` +
    'ON CONFLICT (name) DO UPDATE SET value = excluded.value';
  try {
    execSync(
      `pnpm exec wrangler d1 execute ${DATABASE} --remote -c ${CONFIG} --yes --command "${sql}"`,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    console.warn(
      'A cópia está feita, mas não foi possível registar a hora na base (o painel e o aviso não a veem):\n',
      stderr || 'erro desconhecido',
    );
  }
}

const work = mkdtempSync(join(tmpdir(), 'wattometro-backup-'));
try {
  const sqlPath = join(work, 'export.sql');
  console.log('A exportar a base de dados (fica bloqueada enquanto isso)…');
  execSync(`pnpm exec wrangler d1 export ${DATABASE} --remote -c ${CONFIG} --output "${sqlPath}"`, {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const sealed = sealBackup(readFileSync(sqlPath), password);
  const name = backupName(new Date());
  // Written beside, then renamed: a syncing cloud client never uploads half a copy.
  const partial = join(folder, `${name}.part`);
  writeFileSync(partial, sealed);
  renameSync(partial, join(folder, name));
  console.log(`Cópia gravada: ${join(folder, name)} (${Math.ceil(sealed.length / 1024)} kB).`);
  for (const old of backupsToRemove(readdirSync(folder), keep)) {
    rmSync(join(folder, old));
    console.log(`Apagada a cópia antiga ${old}.`);
  }
  recordBackup(Math.floor(Date.now() / 1000));
} catch (error) {
  // wrangler already printed its message (stdio inherited).
  console.error('A cópia falhou.', error instanceof Error ? error.message : '');
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
