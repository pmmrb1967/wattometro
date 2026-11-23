# Google Drive and Dropbox for the local mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The local mode's sync and backups (already working with OneDrive) also work with the user's Google Drive or Dropbox, the same files and protocol, one service per house.

**Architecture:** Port Faturómetro's provider layer (`../faturometro/src/cloud/`: `oauth.ts`, `dropbox-auth.ts`, `dropbox.ts`, `gdrive-auth.ts`, `gdrive.ts`, `cloud-tokens.ts`, `cloud-drives.ts`, `providers.ts`, with their tests) into `src/cloud/`. The local-mode sync (`src/local/cloud-sync.ts`) already takes a `CloudDrive` and does not change. The link (`src/local/cloud-state.ts`), the sign-in return (`src/local/cloud-return.ts`), the runner (`src/local/cloud-runner.ts`) and the pages stop assuming OneDrive. Google needs its client secret, so the code exchange and renewals go through a new Worker route `POST /v1/google/token` (Faturómetro's `server/src/google-token.ts`), which keeps nothing.

**Tech Stack:** as before (Vite + React + TS, zod, Hono Worker, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-22-local-cloud-sync-design.md` (the protocol, unchanged). The user approved on 2026-11-23: same solution as Faturómetro for Google Drive and Dropbox; the Google token pass-through in the Worker is an accepted exception to "nothing goes to the server" in the local mode (only tokens pass, never house data, nothing stored or logged).

## Global Constraints

- Every reply/visible text in European Portuguese (pós-AO90, "tu"), in `src/i18n/pt-PT/cloud.ts`. Code, names and comments in English. SPDX header `// SPDX-License-Identifier: AGPL-3.0-or-later` on every code file; ported files keep a line `Adapted from Faturómetro (<path>).`
- No `any`; everything from outside validated with zod (as the Faturómetro files already do).
- Providers: `type CloudProvider = 'onedrive' | 'gdrive' | 'dropbox'`, order `['onedrive', 'gdrive', 'dropbox']`, names `OneDrive`, `Google Drive`, `Dropbox`; companies (for "a página da …", "não é a da …", "uma conta …") `Microsoft`, `Google`, `Dropbox`.
- Build ids: `VITE_ONEDRIVE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `VITE_DROPBOX_APP_KEY`, falling back to `PROJECT_ONEDRIVE_CLIENT_ID` (kept: `9c75a57c-b9b8-4d1f-943a-8cf8778a1adb`), `PROJECT_GOOGLE_CLIENT_ID = ''`, `PROJECT_DROPBOX_APP_KEY = ''` in `src/cloud/cloud-config.ts`. A service with an empty id is not offered; with none offered the app behaves exactly as without cloud.
- Return page for Dropbox and Google: `/nuvem-retorno` (SPA route; the address is put back to the page that left before the router renders). sessionStorage keys: `wattometro.cloud.oauth` (pending sign-in), `wattometro.cloud.fresh.<uuid>` (tokens of a sign-in not yet linked).
- Folders: Google Drive `Wattometro` in My Drive (`GOOGLE_ROOT_FOLDER = 'Wattometro'`), scope `https://www.googleapis.com/auth/drive.file`; Dropbox "App folder" access, folder `Apps/Wattometro` (root `""`). Same files as OneDrive: `chave.json`, `casas/<deviceId>.bin`, `copias/…`.
- The lasting link (refresh token) of Dropbox/Google is kept in the CloudLink in IndexedDB (`refreshToken`), as a plain string — Ruling: same protection as MSAL's refresh token in localStorage; encrypting it with the non-extractable master key kept next to it would add nothing. Access tokens live in memory only. Before the link exists they wait in this tab's sessionStorage (`holdFreshTokens`), dropped once linked or on the next start.
- Worker route `POST /v1/google/token`: no session (the local mode has no account), requires `trustedOrigin` (403 `forbidden_origin`), body `{grant:'code', code, codeVerifier, redirectUri} | {grant:'refresh', refreshToken}`, reply `{accessToken, expiresIn, refreshToken?}`; 404 when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are missing; 401 when Google refuses the code or link; 400 invalid body or a `redirectUri` other than `<origin>/nuvem-retorno` for the request's own origin, `ALLOWED_ORIGINS`, or `http://localhost:5173`; 502 when Google fails. Nothing stored or logged. `GOOGLE_CLIENT_ID` is a `[vars]` entry (`""`) in `server/wrangler.toml`; `GOOGLE_CLIENT_SECRET` is a secret.
- CSP `connect-src` adds `https://api.dropboxapi.com https://content.dropboxapi.com https://www.googleapis.com` (sign-in pages are top-level navigations).
- Before reporting done: `pnpm typecheck && pnpm lint` and the tests of the touched areas (`pnpm vitest run <paths> --maxWorkers=2`). The full suite has unrelated 20 s timeouts under load; run it with `--maxWorkers=2`.

## Review Focus

- A Dropbox/Google sign-in that comes back after the tab lost its pending state (reloaded, other tab): nothing breaks, the page just shows its normal state.
- "Ligar de novo" from the banner signs in to the link's own provider, and a return for another provider never changes the link.
- An access token expired mid-cycle: Dropbox/Google 401 → renew once with the refresh token, then `needs_reconnect` if refused.
- Unlinking a Dropbox/Google house forgets the refresh token (link cleared) and does not call MSAL.
- With only some services registered, only those are offered (Landing, Settings), and with one the landing goes straight to it.

---

### Task 1: The provider layer in src/cloud

**Files:**
- Create (port from `../faturometro/src/cloud/`, with tests): `src/cloud/oauth.ts`, `dropbox-auth.ts`, `dropbox.ts`, `gdrive-auth.ts`, `gdrive.ts`, `cloud-tokens.ts`, `cloud-drives.ts` and their `*.test.ts`.
- Modify: `src/cloud/providers.ts` (Faturómetro's, plus `providerCompany`, `cloudAvailable()` = any available), `src/cloud/cloud-config.ts`, `.env.example`, `src/cloud/onedrive-auth.ts` (only if the facade needs it), `src/vite-env.d.ts` if the env vars are typed there.

**Interfaces (Produces):**
- `providers.ts`: `CloudProvider`, `PROVIDER_ORDER`, `providerClientId(p)`, `providerAvailable(p)`, `availableProviders(): CloudProvider[]`, `cloudAvailable(): boolean`, `providerName(p)`, `providerCompany(p)`. Keep `oneDriveClientId()` (used by `onedrive-auth.ts`) as `providerClientId('onedrive')`; remove `oneDriveAvailable` once Task 2 no longer uses it (Task 2 does that).
- `cloud-drives.ts` (no Profile here; Wattómetro has a CloudLink):
  - `signInToCloud(provider, intent: string): Promise<void>` — MSAL for OneDrive, `startOAuth` for the others.
  - `type CloudSignIn = { provider; intent; accountId } | { provider; intent; error }` and `completeCloudSignIn(oauth: OAuthReturn | null): Promise<CloudSignIn | null>` (as Faturómetro's; Google via `exchangeGoogleCode({ serverUrl: '' , … })`, i.e. same-origin `/v1/google/token`, with the global `fetch`).
  - `signedInDrive(provider, accountId): CloudDrive` (right after a sign-in), `signedInLink(provider, accountId): string | undefined`, `forgetSignIn(provider, accountId)`.
  - `linkedDrive(link: { provider; accountId?: string; refreshToken?: string }): CloudDrive` — OneDrive by `accountId`; Dropbox/Google by `tokenSource` on `refreshToken`.
  - `cloudAccountLabel(drive: CloudDrive): Promise<string | undefined>` = `drive.account()` label, undefined on error (OneDrive keeps its MSAL label through `oneDriveFor`).
  - `signOutOfCloud(provider, accountId?)`: MSAL `signOutOfOneDrive` for OneDrive; nothing for the others (forgetting the link is enough).
- `cloud-tokens.ts`: `holdFreshTokens`, `freshTokens`, `dropFreshTokens`, `dropAllFreshTokens`, `tokenSource` (as Faturómetro).

- [ ] Port the files and tests; adapt imports (`CloudProvider` from `./providers`), names (`wattometro.*` keys, `Wattometro` folders), comments.
- [ ] `pnpm vitest run src/cloud --maxWorkers=2`, typecheck, lint green.
- [ ] Commit `feat(cloud): Google Drive and Dropbox drives and sign-in, from Faturómetro`.

### Task 2: The local mode and its pages with any provider

**Files:**
- Modify: `src/local/cloud-state.ts` (`CloudLink.provider: CloudProvider`, `accountId?` for OneDrive, new `refreshToken?: string`; `isLink` accepts the three and requires `refreshToken` for gdrive/dropbox), `src/local/cloud-return.ts`, `src/local/cloud-runner.ts`, `src/local/cloud-sync.ts` (only `provider` in the link it creates: pass it in), `src/main.tsx` if needed, `src/app/CloudSection.tsx`, `src/app/CloudJoin.tsx`, `src/app/Landing.tsx`, `src/app/LocalBanner.tsx`, `src/app/LocalData.tsx`, `src/app/cloud-failure.ts`, `src/app/EredesImport.tsx`, `src/i18n/pt-PT/cloud.ts`, and their tests.

**Interfaces:**
- Consumes Task 1's `cloud-drives.ts` and `providers.ts`.
- `cloud-return.ts`: `startCloudReturn()` — if no service is available, nothing; else `dropAllFreshTokens()`, `takeOAuthReturn(new URL(location.href))`, `history.replaceState` to its `returnTo` (or `/` when lost), then `completeCloudSignIn(oauth)`. `takeCloudReturn(intent): Promise<{ provider: CloudProvider; accountId: string } | null>` (errors and other intents → null), `clearCloudReturn(intent)` unchanged (idempotent, StrictMode-safe as today).
- `cloud-runner.ts`: the functions that took `accountId: string` take `signIn: { provider: CloudProvider; accountId: string }` (`cloudHasHouse`, `linkFirstDevice`, `joinFromCloud`, `relinkAccount`). Every drive of a linked browser comes from `linkedDrive(link)`; right after a sign-in from `signedInDrive`. When a link is saved from a sign-in: OneDrive keeps `accountId`; Dropbox/Google store `refreshToken = signedInLink(...)` and no `accountId`, then `forgetSignIn`. `relinkAccount` ignores a sign-in whose provider differs from the link's. `unlinkCloud` calls `signOutOfCloud(link.provider, link.accountId)`. `CloudStatus` linked gains `provider: CloudProvider`. `cloudStatus`'s default `available` is `cloudAvailable`; `runWhileLinked` likewise.
- Texts: every text naming OneDrive/Microsoft takes the service (and company where needed) as parameters, e.g. `connect: (service) => \`Ligar ao ${service}\``, `leaving: (company) => \`A abrir a página da ${company}…\``, `someAccount: (company) => \`uma conta ${company}\``. Landing: one button `Tenho a casa na cloud`; with one service available it goes straight to it, with more it shows one button per service (`Do OneDrive` / `Do Google Drive` / `Do Dropbox`, text `landingJoin.from(service)`). Settings: one `Ligar ao <service>` button per available service. Section anchor becomes `id="nuvem"` (update the banner link `/definicoes#nuvem`).
- The section title becomes service-neutral when not linked (`Sincronizar e guardar na tua cloud`) and names the service when linked.

- [ ] Update the code and tests (existing tests in `src/local/cloud-*.test.ts`, `src/app/*.test.tsx` that touch these) so they pass; add tests: a Dropbox link saves `refreshToken` and no `accountId`; `relinkAccount` with another provider changes nothing; `cloudStatus` reports the provider; `isLink` refuses a gdrive link without `refreshToken`.
- [ ] `pnpm vitest run src/local src/app src/cloud --maxWorkers=2`, typecheck, lint green.
- [ ] Commit `feat(local): sync the house through Google Drive or Dropbox too`.

### Task 3: Google token route, CSP, docs

**Files:**
- Create: `server/src/google-token.ts` (port), `server/src/routes/google.ts`, `server/src/google-token.test.ts`.
- Modify: `server/src/app.ts` (mount, and list the route in its header comment), `server/src/routes/context.ts` (`AppConfig.google?: { clientId; clientSecret }`, `googleFetch?: typeof fetch`), `server/src/env.ts` (`GOOGLE_CLIENT_ID?`, `GOOGLE_CLIENT_SECRET?`, `googleApp(env)`), `server/src/worker.ts`, `server/wrangler.toml` (`GOOGLE_CLIENT_ID = ""` in `[vars]` with a comment), `security-headers.ts` + `src/app/security-headers.test.ts`, `docs/google-drive.md` and `docs/dropbox.md` (new, adapted from Faturómetro's, with the Wattómetro values: app name `Wattometro`, redirect URIs `https://app.wattometro.workers.dev/nuvem-retorno` and `http://localhost:5173/nuvem-retorno`, scope, folders, where the ids go, `pnpm wrangler secret put GOOGLE_CLIENT_SECRET --config server/wrangler.toml`, `GOOGLE_CLIENT_ID` in wrangler.toml), `docs/onedrive.md` (point to the other two), `docs/local-mode.md` (section "Sincronizar pelo OneDrive" → any of the three, and the Google exception), `CLAUDE.md` (rule 1: add Google `accounts.google.com`/`www.googleapis.com` and Dropbox `www.dropbox.com`/`api.dropboxapi.com`/`content.dropboxapi.com`, only in the local mode and only if the user links that service, each seeing only its folder; the Google token pass-through by the Worker; Stack line), `planning/plan.md` (phase 9 items for Google Drive and Dropbox: code done, registration and real test pending; a decision line dated 2026-11-23).

- [ ] Tests for the route: 404 without config; 403 without trusted Origin; 400 bad body and foreign redirectUri; code grant forwards `client_id`, `client_secret`, `code_verifier`, `redirect_uri` and returns the reply; refresh grant; Google 400 → 401; Google 500 → 502. CSP test includes the three origins.
- [ ] `pnpm vitest run server/src/google-token.test.ts src/app/security-headers.test.ts --maxWorkers=2`, typecheck, lint green.
- [ ] Commit `feat(server): Google token pass-through for Google Drive in the local mode` and `docs: Google Drive and Dropbox for the local mode`.
