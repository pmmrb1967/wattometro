// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household copy's file, sealed in the browser with the account password
 * (WebCrypto and CompressionStream only): gzip, then PBKDF2-SHA256 → AES-256-GCM.
 * The same layout as the administrator's copy (scripts/backup/backup-file.ts),
 * so `pnpm db:backup --decrypt` opens these too:
 *
 *   "WMBK" · version (1 byte) · PBKDF2 iterations (uint32, big-endian)
 *   · salt (16) · IV (12) · ciphertext · GCM tag (16)
 *
 * The header is authenticated as additional data.
 */
const MAGIC = [0x57, 0x4d, 0x42, 0x4b]; // "WMBK"
const VERSION = 1;
/** OWASP's figure for PBKDF2-SHA256 (2023), as the other copies. */
export const SEAL_ITERATIONS = 600_000;
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + 1 + 4 + SALT + IV;

export type SealFailure = 'notACopy' | 'unknownVersion' | 'wrongPassword';

export class SealError extends Error {
  readonly reason: SealFailure;
  constructor(reason: SealFailure) {
    super(reason);
    this.name = 'SealError';
    this.reason = reason;
  }
}

/** A copy whose header was read: the key comes from the password and its salt. */
export interface SealedCopy {
  header: Uint8Array<ArrayBuffer>;
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  body: Uint8Array<ArrayBuffer>;
}

/** Non-extractable: it can be kept in IndexedDB to go on later, never read out. */
export async function sealKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gzip = (bytes: Uint8Array<ArrayBuffer>) => pipe(bytes, new CompressionStream('gzip'));

/** Seals already gzipped bytes. */
export async function sealGzipped(
  zipped: Uint8Array<ArrayBuffer>,
  password: string,
  iterations = SEAL_ITERATIONS,
): Promise<Uint8Array<ArrayBuffer>> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const header = new Uint8Array(HEADER);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  new DataView(header.buffer).setUint32(5, iterations);
  header.set(salt, 9);
  header.set(iv, 9 + SALT);
  const key = await sealKey(password, salt, iterations);
  const body = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, zipped),
  );
  const file = new Uint8Array(HEADER + body.length);
  file.set(header, 0);
  file.set(body, HEADER);
  return file;
}

/** Reads the header; throws SealError when it is not a copy of this format. */
export function readSealed(file: Uint8Array<ArrayBuffer>): SealedCopy {
  if (file.length < HEADER + TAG || MAGIC.some((byte, index) => file[index] !== byte)) {
    throw new SealError('notACopy');
  }
  if (file[4] !== VERSION) throw new SealError('unknownVersion');
  return {
    header: file.slice(0, HEADER),
    iterations: new DataView(file.buffer, file.byteOffset).getUint32(5),
    salt: file.slice(9, 9 + SALT),
    iv: file.slice(9 + SALT, HEADER),
    body: file.slice(HEADER),
  };
}

/** The gzipped content; SealError('wrongPassword') when the key does not open it. */
export async function openGzipped(
  copy: SealedCopy,
  key: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: copy.iv, additionalData: copy.header },
        key,
        copy.body,
      ),
    );
  } catch {
    throw new SealError('wrongPassword');
  }
}

/** The text lines of gzipped bytes, one at a time (a year of minutes never sits whole in memory). */
export async function* gzippedLines(zipped: Uint8Array<ArrayBuffer>): AsyncGenerator<string> {
  const reader = new Blob([zipped])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let rest = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    rest += value;
    let end = rest.indexOf('\n');
    while (end !== -1) {
      yield rest.slice(0, end);
      rest = rest.slice(end + 1);
      end = rest.indexOf('\n');
    }
  }
  if (rest.length > 0) yield rest;
}

/** Writes text lines into gzip as they come; `finish` gives the compressed bytes. */
export function gzipWriter(): {
  write(line: string): Promise<void>;
  finish(): Promise<Uint8Array<ArrayBuffer>>;
} {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  // Read at once, or the writer waits for room.
  const output = new Response(stream.readable).arrayBuffer();
  const encoder = new TextEncoder();
  return {
    write: (line) => writer.write(encoder.encode(`${line}\n`)),
    finish: async () => {
      await writer.close();
      return new Uint8Array(await output);
    },
  };
}
