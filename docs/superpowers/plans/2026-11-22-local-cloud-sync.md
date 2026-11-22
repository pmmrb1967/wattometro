# Modo sem conta no OneDrive — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a casa do modo sem conta sincroniza entre aparelhos e faz cópias automáticas numa pasta do OneDrive do utilizador, cifrada no browser.

**Architecture:** cada aparelho grava a sua fotografia cifrada (`casas/<deviceId>.bin`) e junta as dos outros com uma função pura (`src/local/merge.ts`) baseada em carimbos por secção guardados à parte da casa (`SyncMeta`). A camada da cloud e a cifra vêm do Faturómetro (`src/cloud/`, `src/lib/crypto.ts`). Um ciclo de sincronização puro sobre `CloudDrive` + `LocalStore` (`src/local/cloud-sync.ts`) é chamado por um agendador no browser.

**Tech Stack:** TypeScript strict, React 18, IndexedDB, WebCrypto (AES-GCM, PBKDF2, HKDF), `@azure/msal-browser` 5.28.0, Microsoft Graph, zod 4, Vitest (ambiente `node`).

**Spec:** `docs/superpowers/specs/2026-11-22-local-cloud-sync-design.md` (ler antes de cada tarefa).

**Fonte a copiar:** `C:\Users\PBarbosa\projects\faturometro` (abreviado `FAT/`). Ao copiar, acrescentar `// SPDX-License-Identifier: AGPL-3.0-or-later` e uma linha "Adapted from Faturómetro (<caminho>)." no comentário do topo.

## Global Constraints

- Código, nomes e comentários em inglês; texto visível em pt-PT ("tu"), em `src/i18n/pt-PT/cloud.ts` (novo, juntado em `src/i18n/pt-PT.ts` como `cloudTexts`).
- Sem `any`; tudo o que vem da cloud validado com zod.
- `LocalData` e `LOCAL_VERSION` (3) não mudam; `src/local/stored.test.ts` não se edita.
- Permissões Microsoft: só `Files.ReadWrite.AppFolder` e `offline_access`; entrada por redirecionamento (COOP `same-origin`).
- Nada passa pelo Worker do Wattómetro.
- Cópias: de 7 em 7 dias, 8 guardadas no total, nome `wattometro-<AAAA-MM-DD>-<8 primeiros do deviceId>.bin`.
- Sincronizar: ao abrir, 10 s depois da última escrita local, de 5 em 5 min com a app aberta, ao voltar a ligação.
- Carimbo recebido mais de 86 400 s no futuro conta como `agora`.
- PBKDF2: 600 000 iterações (testes podem passar menos, como no Faturómetro).
- Antes de cada commit: `pnpm typecheck && pnpm lint && pnpm test`. Commits Conventional, terminados com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Casa ilegível neste browser** (`LocalRead` `unreadable`): o ciclo não lê para juntar nem escreve nada na cloud — teste em Task 6.
2. **Dois separadores abertos**: só um ciclo corre de cada vez e a escrita da casa junta passa pela mesma fila/lock das escritas da API — teste em Task 6 (`exclusive` chamado) e Task 1 (`exclusive` serializa com `respond`).
3. **Pasta da cloud apagada a meio** (sem `chave.json`, ou `keyId` diferente): o aparelho desliga-se e não volta a criar `casas/` — teste em Task 6.
4. **Ligação expirada (`needs_reconnect`) durante um ciclo**: o estado guarda o erro, a faixa mostra-o, e as alterações locais ficam para o ciclo seguinte — teste em Task 6 (`result.error`).
5. **Repor uma cópia antiga com a cloud ligada**: os quartos que estavam noutros aparelhos não voltam — teste em Task 2 (geração) e Task 8 (`restoreHouse` cria geração nova).

---

### Task 1: Carimbos por secção (`SyncMeta`) guardados com a casa

**Files:**
- Create: `src/local/meta.ts`, `src/local/meta.test.ts`
- Modify: `src/local/store.ts`, `src/local/store.test.ts`, `src/local/server.ts`, `src/local/server.test.ts`

**Interfaces:**
- Produces (`src/local/meta.ts`):
  - `export const SECTIONS = ['quarters','tariffs','zone','location','budget','installation','equipment'] as const; export type Section = (typeof SECTIONS)[number];`
  - `export interface Generation { id: string; at: number }`
  - `export interface SyncMeta { stamps: Record<Section, number>; quartersGeneration: Generation }`
  - `export const syncMetaSchema: z.ZodType<SyncMeta>`
  - `export function emptyMeta(): SyncMeta` (stamps a 0; geração `{ id: '', at: 0 }`)
  - `export function sectionValue(data: LocalData, section: Section): unknown` (`equipment` → `{ equipment, alwaysOn }`)
  - `export function stampChanges(before: LocalData, after: LocalData, meta: SyncMeta, now: number): SyncMeta` (secções cujo `JSON.stringify(sectionValue)` mudou ficam com `now`)
  - `export function newGeneration(now: number): Generation` (`crypto.randomUUID()`)
- Produces (`src/local/store.ts`): `LocalStore` ganha `loadMeta(): Promise<SyncMeta>` e `save(data: LocalData, meta?: SyncMeta): Promise<boolean>` (com `meta`, as duas chaves `data` e `meta` na mesma transação); `clear()` apaga as duas; `memoryStore(initial?, meta?)`.
- Produces (`src/local/server.ts`): `createLocalServer` devolve também `exclusive<T>(task: () => Promise<T>): Promise<T>` (mesma fila `writes` + `acrossTabs`, e `data = null` antes e depois). Exportado como `localExclusive`.

- [ ] **Step 1: Testes que falham** — `meta.test.ts`:
  - `stampChanges marks only the changed section`: mudar `zone` de `null` para `'B'` com `now = 1_800_000_000` → `stamps.zone === 1_800_000_000`, todas as outras 0.
  - `alwaysOn changes stamp the equipment section`.
  - `syncMetaSchema rejects a missing section`.
  - `store.test.ts`: `memoryStore keeps meta with the house`; `loadMeta without meta is emptyMeta()`; `clear removes the meta`.
  - `server.test.ts`: `PUT /v1/quality/zone stamps zone with the clock` (`loadMeta().stamps.zone === NOW`); `DELETE /v1/import/eredes starts a new quarters generation` (`quartersGeneration.at === NOW`, `id !== ''`, `stamps.quarters === NOW`); `exclusive runs between writes, never during one`.
- [ ] **Step 2:** `pnpm vitest run src/local` → FAIL (módulo/funções em falta).
- [ ] **Step 3:** implementar `meta.ts`; em `store.ts` a chave `meta` no mesmo object store `household` (sem mudar a versão da base IndexedDB); em `server.ts`, `keep(next, options?: { newQuarters?: boolean })` lê `loadMeta()`, aplica `stampChanges(house, next, meta, now)` (e `newGeneration(now)` quando `newQuarters`) e grava com `store.save(next, meta)`. `DELETE /v1/import/eredes` usa `newQuarters: true`.
- [ ] **Step 4:** `pnpm vitest run src/local` → PASS, incluindo `stored.test.ts` sem alterações.
- [ ] **Step 5:** commit `feat(local): per-section change stamps kept with the house`.

### Task 2: Juntar casas (`mergeHouses`)

**Files:**
- Create: `src/local/merge.ts`, `src/local/merge.test.ts`

**Interfaces:**
- Consumes: Task 1 (`SyncMeta`, `SECTIONS`, `sectionValue`).
- Produces:
  - `export interface HouseSnapshot { deviceId: string; data: LocalData; meta: SyncMeta }`
  - `export function mergeHouses(mine: HouseSnapshot, theirs: readonly HouseSnapshot[], now: number): { data: LocalData; meta: SyncMeta }`

Regras (spec, "Juntar"): geração dos quartos mais recente (`at`, depois `id`) ganha e só os quartos dessa geração entram na união; mesma hora → o da fotografia com `stamps.quarters` maior (empate: `deviceId` maior); restantes secções → secção inteira com o carimbo maior, empate entre carimbos ≠ 0 pelo `deviceId` maior; carimbo `> now + 86_400` conta como `now`; o `meta` do resultado tem, por secção, o carimbo vencedor.

- [ ] **Step 1: Testes que falham** (todos com casas pequenas construídas à mão):
  - `unions quarters of two devices` (A tem `[900·n, 100, 0]` às 00:00, B às 00:15 → as duas).
  - `same quarter: the newer quarters stamp wins`.
  - `newer section wins whole` (tarifários A carimbo 10, B carimbo 20 → os de B, mesmo com menos itens).
  - `a stamp of 0 loses to any stamp`.
  - `tie on equal non-zero stamps goes to the larger deviceId`.
  - `deleting a tariff propagates` (A apagou, carimbo maior → lista sem o tarifário).
  - `a newer quarters generation drops the older quarters` (B repôs: geração `at` 50 → os quartos de A, geração 0, não entram).
  - `equipment and alwaysOn come from the same snapshot`.
  - `a stamp more than a day ahead counts as now`.
  - `order of theirs does not change the result` (permutar 3 fotografias → `toEqual`).
- [ ] **Step 2:** `pnpm vitest run src/local/merge.test.ts` → FAIL.
- [ ] **Step 3:** implementar `mergeHouses` em `merge.ts` (puro, sem I/O; quartos por ordem de início como `withQuarters`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(local): merge the house snapshots of several devices`.

### Task 3: Cifra do Faturómetro

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/crypto.test.ts`, `src/lib/base32.ts` (copiados de `FAT/src/lib/`)

**Interfaces:**
- Produces: `EncryptedBlob`, `WrappedMasterKey`, `PBKDF2_ITERATIONS`, `WrongSecretError`, `createAccountKeys(password, iterations?)`, `unlockWithPassword`, `unlockWithRecoveryKey`, `rewrapWithPassword`, `encryptJson(key, value)`, `decryptJson(key, blob)`, `toBase64`, `fromBase64`, mais o novo `export async function nonExtractable(key: CryptoKey): Promise<CryptoKey>` (exporta raw e reimporta AES-GCM com `extractable: false`, usos `encrypt`/`decrypt`).
- Copiar só o que se usa: sem `deriveSyncKeys`, `deriveOwnerProof`, `wrapForSync`, `sha256Hex`, `exportMasterKey`/`importMasterKey` públicos (podem ficar privados para `nonExtractable`).

- [ ] **Step 1:** copiar `crypto.test.ts`, retirando os testes das funções não copiadas; acrescentar `nonExtractable keeps decrypting and cannot be exported` (`decryptJson` com a nova chave devolve o valor; `crypto.subtle.exportKey('raw', k)` rejeita).
- [ ] **Step 2:** `pnpm vitest run src/lib/crypto.test.ts` → FAIL.
- [ ] **Step 3:** copiar `crypto.ts` e `base32.ts` reduzidos; implementar `nonExtractable`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(lib): the device-side encryption of Faturómetro`.

### Task 4: Camada da cloud e adaptador OneDrive (sem entrada Microsoft)

**Files:**
- Create (copiados de `FAT/src/cloud/`): `src/cloud/drive.ts`, `src/cloud/onedrive.ts`, `src/cloud/onedrive.test.ts`, `src/cloud/memory-drive.ts`, `src/cloud/memory-drive.test.ts`, `src/cloud/fake-fetch.ts`

**Interfaces:**
- Produces: `CloudDrive`, `CloudEntry`, `CloudFile`, `CloudWriteOptions`, `CloudError`, `CloudErrorCode`, `readJson`, `readJsonWithEtag`, `writeJson` (drive.ts); `class OneDrive implements CloudDrive` com `new OneDrive(token: () => Promise<string>, options?: OneDriveOptions)` (manter o construtor do Faturómetro); `class MemoryDrive` com `failNext(code, operation?)` e `files`.
- `drive.ts`: o comentário do topo passa a dizer que só `chave.json` e os cabeçalhos dos ficheiros vão em claro.

- [ ] **Step 1:** copiar os testes (`onedrive.test.ts`, `memory-drive.test.ts`).
- [ ] **Step 2:** FAIL (módulos em falta).
- [ ] **Step 3:** copiar os módulos, sem referências a perfis/`db/profiles` do Faturómetro.
- [ ] **Step 4:** `pnpm vitest run src/cloud` → PASS.
- [ ] **Step 5:** commit `feat(cloud): cloud drive interface and OneDrive adapter from Faturómetro`.

### Task 5: Ficheiros da pasta (chave, fotografias, cópias)

**Files:**
- Create: `src/local/cloud-files.ts`, `src/local/cloud-files.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `export const KEY_FILE = 'chave.json'; export const HOUSES_FOLDER = 'casas'; export const BACKUPS_FOLDER = 'copias';`
  - `export interface CloudKey { keyId: string; masterKey: CryptoKey }`
  - `export async function createKeyFile(drive: CloudDrive, password: string, iterations?: number): Promise<CloudKey & { recoveryKey: string }>` (escreve com `ifNoneMatch: '*'`; `conflict` → `CloudKeyError('exists')`)
  - `export async function readKeyFile(drive): Promise<{ keyId: string; wrappedKey: WrappedMasterKey } | null>`
  - `export async function unlockKeyFile(drive, secret: { password: string } | { recoveryKey: string }): Promise<CloudKey>` (`CloudKeyError('wrong_secret' | 'missing')`; devolve a chave já `nonExtractable`)
  - `export class CloudKeyError extends Error { code: 'exists' | 'missing' | 'wrong_secret' }`
  - `export interface HousePayload { version: number; deviceId: string; writtenAt: number; data: LocalData; meta: SyncMeta }`
  - `export async function encodeHouse(key: CloudKey, payload: HousePayload): Promise<Uint8Array>` → JSON `{ format: 'wattometro-local-house', keyId, blob }`
  - `export async function decodeHouse(key: CloudKey, bytes: Uint8Array): Promise<{ kind: 'ok'; payload: HousePayload } | { kind: 'other_key' } | { kind: 'newer'; version: number } | { kind: 'unreadable' }>` (versões antigas passam por `readStored` para `data`)
  - `export const housePath = (deviceId: string) => \`casas/${deviceId}.bin\``
  - `export function backupName(day: string /* AAAA-MM-DD */, deviceId: string): string` e `export function parseBackupName(name: string): { day: string } | null` (só o padrão da app)

- [ ] **Step 1: Testes que falham:** `createKeyFile then unlockKeyFile with the password`; `unlock with the recovery key`; `wrong password is wrong_secret`; `createKeyFile never overwrites an existing chave.json`; `encode/decode round trip`; `other keyId is other_key without decrypting`; `newer version is newer`; `corrupt blob is unreadable`; `parseBackupName ignores files not made by the app` (`'notas.txt'`, `'wattometro-2026-11-22.bin'` → null; `'wattometro-2026-11-22-1a2b3c4d.bin'` → `{ day: '2026-11-22' }`). Usar `iterations: 1_000`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar, com zod para `chave.json` (`format: 'wattometro-cloud-key'`, `version: 1`, `keyId`, `wrappedKey` com a forma de `FAT/src/cloud/cloud-account.ts` `accountSchema.wrappedKey`) e para o cabeçalho da fotografia.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(local): encrypted key, house and backup files for the cloud folder`.

### Task 6: Ciclo de sincronização e estado deste browser

**Files:**
- Create: `src/local/cloud-state.ts`, `src/local/cloud-sync.ts`, `src/local/cloud-sync.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 5; `localExclusive` (Task 1).
- Produces (`cloud-state.ts`):
  - `export interface CloudLink { provider: 'onedrive'; deviceId: string; keyId: string; masterKey: CryptoKey; accountId?: string; accountLabel?: string; lastSyncAt?: number; lastPushedStamp?: number; error?: CloudErrorCode | 'unreadable_device' | 'newer_app' | 'removed' }`
  - `export interface CloudLinkStore { load(): Promise<CloudLink | null>; save(link: CloudLink): Promise<boolean>; clear(): Promise<boolean> }`
  - `export const browserCloudLinkStore: CloudLinkStore` (IndexedDB `wattometro-cloud`, guarda a `CryptoKey` tal como é) e `export function memoryCloudLinkStore(initial?: CloudLink): CloudLinkStore`
- Produces (`cloud-sync.ts`):
  - `export interface SyncDeps { drive: CloudDrive; house: LocalStore; links: CloudLinkStore; exclusive: <T>(task: () => Promise<T>) => Promise<T>; now: () => number; onHouseChanged: () => void }`
  - `export interface SyncResult { pulled: number; pushed: boolean; backup: boolean; error?: CloudLink['error'] }`
  - `export async function syncOnce(deps: SyncDeps): Promise<SyncResult>` — passos 0–5 da spec ("Sincronizar") e as cópias (calendário partilhado listando `copias/`; apagar além das 8 só com `parseBackupName`); lê e decifra só as fotografias cujo `etag` mudou; as outras vêm de um cache em memória do módulo (`Map<path, { etag, payload }>`), lido de novo por inteiro quando o cache está vazio (arranque). `seenEtags` sai do `CloudLink`.
  - `export async function connectFirst(deps: Omit<SyncDeps,'links'> & { links: CloudLinkStore }, password: string, account: { id?: string; label?: string }): Promise<{ recoveryKey: string }>` — carimba com `now` as secções com dados e carimbo 0 (spec "Aparelho novo", ponto 4), cria `chave.json`, corre `syncOnce`.
  - `export async function joinCloud(deps, secret: { password: string } | { recoveryKey: string }, mode: 'join' | 'replace', account): Promise<void>` — "Juntar": a casa local adota a `quartersGeneration` da cloud (a mais recente das fotografias) e zera os carimbos das secções que a cloud já tem (carimbo ≠ 0 nalguma fotografia), carimbando `now` as outras com dados; "Ficar com a da cloud": substitui a casa local pela junção das fotografias. Casa local vazia: `replace` sem perguntar (decidido na UI).
  - `export async function disconnect(deps, options: { removeCloud: boolean }): Promise<void>` — apaga `casas/<eu>.bin` (ou, com `removeCloud`, todos os ficheiros de `casas/`, `copias/` com padrão da app e `chave.json`) e o `CloudLink`.

- [ ] **Step 1: Testes que falham** (`MemoryDrive`, `memoryStore`, `memoryCloudLinkStore`, dois "aparelhos" A e B partilhando o mesmo `MemoryDrive`, `iterations` baixas):
  - `two devices end with the same house` (A muda tarifários, B muda zona, ciclos A,B,A → as duas casas iguais e com as duas mudanças).
  - `an unreadable local house writes nothing` (`house.load` → `unreadable`; `drive.files` igual antes e depois; `result.error === undefined`, `pushed === false`).
  - `missing chave.json disconnects without writing` (apagar `chave.json` → `result.error === 'removed'`, `links.load()` null, nenhum `casas/` novo).
  - `a corrupt snapshot of one device does not stop the others` (`error === 'unreadable_device'`, as outras juntam).
  - `a snapshot of a newer app stops with newer_app and writes nothing`.
  - `needs_reconnect is kept on the link and nothing is lost` (próximo ciclo sem falha envia a alteração).
  - `throttled keeps retryAfter in the error and does not push`.
  - `merged house is written through exclusive` (espião em `exclusive`).
  - `join adds the browser house without taking from the cloud`.
  - `an empty house joined later does not empty the cloud`.
  - `backup every 7 days, shared between devices` (A faz cópia no dia 0; B no dia 3 não faz; B no dia 8 faz; nomes com o `deviceId` de cada um).
  - `keeps the 8 newest backups and never removes other files` (`copias/notas.txt` fica).
  - `disconnect removes only this device's snapshot`; `disconnect with removeCloud empties the folder`.
- [ ] **Step 2:** `pnpm vitest run src/local/cloud-sync.test.ts` → FAIL.
- [ ] **Step 3:** implementar `cloud-state.ts` e `cloud-sync.ts`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(local): sync cycle, joining and backups through the cloud folder`.

### Task 7: Entrada Microsoft, página de regresso e política de segurança

**Files:**
- Create (de `FAT/`): `src/cloud/onedrive-auth.ts`, `src/cloud/auth-redirect.ts`, `auth-redirect.html` (raiz), `src/cloud/cloud-config.ts` (só `PROJECT_ONEDRIVE_CLIENT_ID = ''` até haver registo) e `src/cloud/providers.ts` reduzido a `oneDriveClientId(): string` e `oneDriveAvailable(): boolean`
- Modify: `package.json` (`@azure/msal-browser` `5.28.0`), `vite.config.ts` (`build.rollupOptions.input: { main: 'index.html', 'auth-redirect': 'auth-redirect.html' }`; `navigateFallbackDenylist` + `/^\/auth-redirect\.html/`), `security-headers.ts`, `security-headers.test.ts` (novo), `CLAUDE.md` (regra 1 e Stack), `.env.example` (`VITE_ONEDRIVE_CLIENT_ID=`)

**Interfaces:**
- Produces (`onedrive-auth.ts`, como no Faturómetro): `signInToOneDrive(intent: string): Promise<void>`, `completeOneDriveSignIn(): Promise<{ intent: string; accountId: string } | null>`, `oneDriveToken(accountId?: string): Promise<string>`, `oneDriveAccountLabel(accountId?)`, `signOutOfOneDrive(accountId?)`. `PENDING_KEY = 'wattometro.onedrive.intent'`.
- `auth-redirect.ts`: sem resposta, `window.location.replace('/')`.
- `security-headers.ts`: `export const AUTH_REDIRECT_PATH = '/auth-redirect.html'`; `connect-src` + `https://login.microsoftonline.com https://graph.microsoft.com https://*.files.1drv.com https://*.livefilestore.com https://my.microsoftpersonalcontent.com https://*.sharepoint.com`; `frame-src 'self' https://login.microsoftonline.com`.

- [ ] **Step 1:** em `security-headers.test.ts` (novo, na raiz): `connect-src lists the Microsoft hosts and nothing else new` (lista exata) e `frame-src allows only self and Microsoft sign-in`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `pnpm add @azure/msal-browser@5.28.0`; copiar/adaptar os ficheiros; alterar `vite.config.ts`, `security-headers.ts`; CLAUDE.md regra 1: acrescentar "a Microsoft (`login.microsoftonline.com`, `graph.microsoft.com` e os anfitriões de descarregamento do OneDrive), só no modo sem conta e só se o utilizador ligar o OneDrive; a app só vê a sua pasta (`Files.ReadWrite.AppFolder`) e lá só ficam ficheiros cifrados no browser (`docs/local-mode.md`)"; Stack: a linha do MSAL.
- [ ] **Step 4:** `pnpm test` PASS e `pnpm build` gera `dist/auth-redirect.html`.
- [ ] **Step 5:** commit `feat(cloud): Microsoft sign-in by redirect and the OneDrive hosts in the CSP`.

### Task 8: Agendador, Definições › Dados e faixa do topo

**Files:**
- Create: `src/local/cloud-runner.ts`, `src/local/cloud-runner.test.ts`, `src/app/CloudSection.tsx`, `src/i18n/pt-PT/cloud.ts`
- Modify: `src/i18n/pt-PT.ts`, `src/app/LocalData.tsx`, `src/app/LocalBanner.tsx`, `src/local/backup.ts`, `src/local/server.ts` (chamar `notifyLocalWrite()` no `onChange`), `src/main.tsx` (`completeOneDriveSignIn` antes do router, como `FAT/src/app/cloud-return-start.ts`)

**Interfaces:**
- Consumes: Tasks 6, 7.
- Produces (`cloud-runner.ts`):
  - `export function startCloudRunner(options?: { setTimer?: typeof setTimeout; now?: () => number }): () => void` — corre `syncOnce` ao arrancar, 10 000 ms depois da última `notifyLocalWrite()`, a cada 300 000 ms, e em `online`; um de cada vez entre separadores (`navigator.locks` `'wattometro-cloud-sync'`); respeita `retryAfterSeconds` em `throttled`; emite `CLOUD_CHANGED` (evento da janela) com o `SyncResult`.
  - `export function notifyLocalWrite(): void`
  - `export async function cloudStatus(): Promise<{ linked: false } | { linked: true; accountLabel?: string; lastSyncAt?: number; error?: CloudLink['error'] }>`
  - `export async function restoreHouse(data: LocalData): Promise<boolean>` — grava com meta: todas as secções `now`, `newGeneration(now)`; usado por "Repor cópia" (ficheiro e cloud).
  - `export async function listCloudBackups(): Promise<{ name: string; day: string; size: number }[]>` e `export async function readCloudBackup(name: string): Promise<LocalData | null>`
- `backup.ts`: `localStatus` passa a receber `cloudOk: boolean` (cloud ligada sem erro e `lastSyncAt` com menos de 30 dias → nunca `due`/`never`).

- [ ] **Step 1: Testes que falham** (`cloud-runner.test.ts`, com temporizador falso e `syncOnce` simulado por injeção): `runs once on start`; `runs 10 s after the last write, once for a burst`; `waits retryAfter after throttled`. Em `backup.test.ts`: `a working cloud link counts as a copy`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implementar o agendador e `restoreHouse`; `CloudSection.tsx` com o esboço da spec ("Interface"): ligar (palavra-passe ×2, chave de recuperação com "Copiar" e "Já a guardei"), estado ligado, "Sincronizar agora", "Desligar", lista de cópias com "Repor"; `LocalData.tsx`: "Repor cópia" usa `restoreHouse` e, com cloud ligada, a confirmação diz que muda todos os aparelhos; "Apagar" com cloud ligada pergunta "Só deste browser" / "Também da cloud" (este pede escrever "apagar") e chama `disconnect`; `LocalBanner.tsx`: mensagens para `needs_reconnect` (botão "Ligar de novo ao OneDrive" → `signInToOneDrive('reconnect')`), `quota_full`, `newer_app`, `unreadable_device`, `removed`. Textos em `cloud.ts`. `CloudSection` só aparece com `oneDriveAvailable()`.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` PASS; `pnpm build` PASS.
- [ ] **Step 5:** commit `feat(local): OneDrive sync in Settings, with the banner and the schedule`.

### Task 9: Aparelho novo pela página de entrada

**Files:**
- Modify: `src/app/Landing.tsx`, `src/app/AppShell.tsx`, `src/i18n/pt-PT/cloud.ts`
- Create: `src/app/CloudJoin.tsx`

**Interfaces:**
- Consumes: `signInToOneDrive('join')`, `completeOneDriveSignIn`, `joinCloud`, `startLocal` (AppShell).
- Fluxo (spec "Aparelho novo"): botão "Tenho a casa no OneDrive" junto a "Usar sem conta" (só com `oneDriveAvailable()`); ao voltar com `intent === 'join'`, `CloudJoin` pede palavra-passe (ou "Usar a chave de recuperação"); casa local vazia → `joinCloud(..., 'replace')`; com dados → escolher "Juntar as duas casas" / "Ficar com a da cloud" (este descarrega antes a cópia manual, como `LocalData.save`); depois `enterLocal()` e `startCloudRunner()`. Sem `chave.json` na pasta: "Esta pasta do OneDrive ainda não tem uma casa. Usa sem conta e liga o OneDrive em Definições." Palavra-passe errada: mensagem, sem limite.

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test` antes (base verde).
- [ ] **Step 2:** implementar e ligar o fluxo.
- [ ] **Step 3:** `pnpm build` e `pnpm test:e2e` (a demonstração não pode mudar) PASS.
- [ ] **Step 4:** commit `feat(local): open a house from OneDrive on a new device`.

### Task 10: Documentação e teste real

**Files:**
- Create: `docs/onedrive.md` (adaptado de `FAT/docs/onedrive.md`: registo "Wattómetro" no Entra, SPA, regressos `https://app.wattometro.workers.dev/auth-redirect.html` e `http://localhost:5173/auth-redirect.html`, permissões)
- Modify: `docs/local-mode.md` (secção "Sincronizar pelo OneDrive"; tabela: sai "Sincronização entre aparelhos" de "Não há"), `planning/plan.md` (tarefas marcadas e decisão de 2026-11-22 em "Decisões")

- [ ] **Step 1:** escrever a documentação.
- [ ] **Step 2:** pedir ao utilizador o registo no Entra e o id (`PROJECT_ONEDRIVE_CLIENT_ID` em `src/cloud/cloud-config.ts`, ou `VITE_ONEDRIVE_CLIENT_ID` no `.env.local` para testar).
- [ ] **Step 3:** teste manual com conta Microsoft real em `pnpm dev`: ligar no PC, abrir no telemóvel ("Tenho a casa no OneDrive"), mudar nos dois, esperar a expiração e reconectar, repor uma cópia da cloud, desligar. Registar os anfitriões reais de descarregamento vistos nos pedidos; se algum faltar ou sobrar em `security-headers.ts`, corrigir. Fechar o browser do Playwright no fim.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` PASS; commit `docs(local): OneDrive sync of the local mode`.
