// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Creates a user (or sets a new password, which signs them out everywhere).
 * There is no public sign-up: this script is the only way in. The password is
 * typed without showing; only its PBKDF2 hash reaches D1.
 * Adapted from poderebeleza (scripts/criar-admin.mjs).
 *
 * Run it in a normal terminal, in the project folder:
 *   pnpm user:create --remote   # production
 *   pnpm user:create --local    # local development (pnpm dev:server)
 */
import { execSync } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { z } from 'zod';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../server/src/password';

const DATABASE = 'wattometro';
const CONFIG = 'server/wrangler.toml';
const EMAIL = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
/** Letters, digits, spaces and hyphens: safe inside the SQL and the Windows command line. */
const HOUSEHOLD_NAME = /^[\p{L}\p{N} -]{1,60}$/u;

const target = process.argv.includes('--remote')
  ? '--remote'
  : process.argv.includes('--local')
    ? '--local'
    : null;
if (!target) {
  console.error('Indica --remote (produção) ou --local.');
  process.exit(1);
}

// One reader for every question; hidden answers echo "*" (also when the line is redrawn).
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
}) as Interface & { _writeToOutput(text: string): void; output: NodeJS.WriteStream };
let hidden = false;
rl._writeToOutput = (text) => rl.output.write(hidden ? text.replace(/[^\r\n]/g, '*') : text);
const lines = rl[Symbol.asyncIterator]();

function fail(message: string): never {
  console.error(message);
  rl.close();
  process.exit(1);
}

async function ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
  process.stdout.write(question);
  hidden = Boolean(options.hidden);
  const { value, done } = await lines.next();
  hidden = false;
  if (options.hidden) process.stdout.write('\n');
  if (done) fail('\nCancelado.');
  return String(value);
}

/** Runs SQL through wrangler. No --file: remotely it imports and locks the database meanwhile. */
function d1(sql: string, json = false): string {
  const line = sql.replace(/\s+/g, ' ').trim();
  if (line.includes('"')) throw new Error('SQL must not contain double quotes');
  const command = `pnpm exec wrangler d1 execute ${DATABASE} ${target} -c ${CONFIG} --yes${json ? ' --json' : ''} --command "${line}"`;
  return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

const Households = z.array(
  z.object({ results: z.array(z.object({ id: z.string(), name: z.string() })) }),
);

const email = (await ask('Email: ')).trim().toLowerCase();
if (!EMAIL.test(email)) fail('Email inválido.');
const password = await ask(`Password (mín. ${MIN_PASSWORD_LENGTH} caracteres): `, {
  hidden: true,
});
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`A password tem de ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
}
if ((await ask('Repete a password: ', { hidden: true })) !== password) {
  fail('As passwords não coincidem.');
}

const households =
  Households.parse(JSON.parse(d1('SELECT id, name FROM households ORDER BY created_at', true)))[0]
    ?.results ?? [];

let householdId: string;
let createHousehold = '';
if (households.length === 0) {
  const name = (await ask('Ainda não há casas. Nome da casa [Casa]: ')).trim() || 'Casa';
  if (!HOUSEHOLD_NAME.test(name)) fail('Usa só letras, algarismos, espaços e hífenes no nome.');
  householdId = crypto.randomUUID();
  createHousehold = `INSERT INTO households (id, name, created_at) VALUES ('${householdId}', '${name}', ${Math.floor(Date.now() / 1000)});`;
} else if (households.length === 1) {
  householdId = households[0]!.id;
  console.log(`Casa: ${households[0]!.name}`);
} else {
  households.forEach((household, index) => console.log(`  ${index + 1}. ${household.name}`));
  const choice = households[Number(await ask('Número da casa: ')) - 1];
  if (!choice) fail('Escolha inválida.');
  householdId = choice.id;
}
rl.close();

const passwordHash = await hashPassword(password);
const now = Math.floor(Date.now() / 1000);
// Email validated above (no quotes), the hash only has [A-Za-z0-9_$-], ids are UUIDs.
// An existing email keeps its household and gets the new password; old sessions end.
const sql = `${createHousehold}
  INSERT INTO users (id, household_id, email, password_hash, created_at)
    VALUES ('${crypto.randomUUID()}', '${householdId}', '${email}', '${passwordHash}', ${now})
    ON CONFLICT (email) DO UPDATE SET
      password_hash = excluded.password_hash,
      session_version = users.session_version + 1;
  DELETE FROM login_attempts WHERE email = '${email}';`;

try {
  d1(sql);
  console.log(`Conta ${email} pronta (${target === '--remote' ? 'produção' : 'local'}).`);
} catch (error) {
  // Never print the command: it holds the hash. Only wrangler's message.
  const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
  console.error('Não foi possível gravar a conta:\n', stderr || 'erro desconhecido');
  process.exitCode = 1;
}
