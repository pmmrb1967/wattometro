# Google Drive: registo da app

A sincronização do modo sem conta pelo Google Drive (`docs/local-mode.md`) precisa de um projeto na Google Cloud com um cliente OAuth. Faz-se **uma vez, pelo responsável**. Os utilizadores não fazem nada disto: só carregam em "Ligar ao Google Drive" e aceitam o pedido da Google. Adaptado do Faturómetro (`docs/google-drive.md` de lá).

Ao contrário do OneDrive e do Dropbox, há **um segredo**. A Google só dá acesso duradouro a quem tem o segredo do cliente, e por isso:

- o **Client ID** não é secreto e vai para a app (`PROJECT_GOOGLE_CLIENT_ID` em `src/cloud/cloud-config.ts`) e para o Worker (`GOOGLE_CLIENT_ID` em `[vars]` de `server/wrangler.toml`);
- as três peças **têm de estar definidas em conjunto**: `VITE_GOOGLE_CLIENT_ID` ou `PROJECT_GOOGLE_CLIENT_ID` na app, `GOOGLE_CLIENT_ID` no Worker e o segredo `GOOGLE_CLIENT_SECRET`; se faltar o do Worker, a app oferece o Google Drive mas a troca do código falha (404) e a ligação não se faz;
- o **Client secret** vai **só para os secrets do Worker** (`wrangler secret put`), nunca para o repositório nem para a app;
- a troca do código e as renovações passam pelo Worker (`POST /v1/google/token`, `server/src/google-token.ts`). O Worker junta o segredo e envia o pedido à Google, sem guardar nem registar nada. Passam só códigos e tokens, nunca dados da casa. É **um único segredo para todos os utilizadores**; o modo sem conta não tem conta, por isso a rota não exige sessão, só que o pedido venha da própria app (cabeçalho `Origin`) e que o endereço de regresso seja `<origem>/nuvem-retorno` da app (ou `http://localhost:5173/nuvem-retorno`, ou uma das `ALLOWED_ORIGINS`).

Sem o Client ID na app, a opção Google Drive não aparece. Sem o Client ID e o segredo no Worker, a rota responde 404 e a entrada falha.

**Registo atual** (2026-11-23): Client ID `136530327915-jk09trobrcu81deuivb9pa78ojfvp17e.apps.googleusercontent.com`, em `src/cloud/cloud-config.ts` e em `server/wrangler.toml`; o segredo só nos secrets do Worker `api`. Não ponhas no repositório (público) o email da conta da consola nem outros dados pessoais.

## Passos (consola em inglês)

Os nomes dos menus mudam com frequência; se algum não bater certo, procura o equivalente.

1. Entra em <https://console.cloud.google.com> com a conta Google que vai gerir a app. Os utilizadores ligam a sua própria conta.
2. **Novo projeto**: no seletor de projetos do topo, **New project**, com o nome `Wattometro`. Não é preciso faturação.
3. **Ativar a API**: **APIs & Services → Library**, procura **Google Drive API** e carrega em **Enable**.
4. **Ecrã de consentimento** (**Google Auth Platform**, antes chamado *OAuth consent screen*):
   - **Branding**: nome da app `Wattómetro`, email de apoio e email de contacto do programador (**Developer contact information**). Para poder publicar, a Google exige também:
     - **Application home page**: `https://app.wattometro.workers.dev/`;
     - **Application privacy policy link**: `https://app.wattometro.workers.dev/privacidade` (página pública da app, `src/app/Privacy.tsx`; tem de estar publicada antes de publicares a app na Google);
     - **Authorised domains**: `wattometro.workers.dev` (sem `app.` nem `https://`: no `workers.dev`, o domínio de cada conta é o principal).

     Sem estes, a página **Audience** diz "To publish your app, you must complete your configuration on the Branding page" e não mostra **Publish app**. O **App logo** fica vazio: com logótipo, a Google exige a verificação da marca.
   - **Audience**: **External**.
   - **Data access → Add or remove scopes**: só `https://www.googleapis.com/auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). É uma permissão **não sensível**, o que evita a verificação de segurança da Google. Não acrescentes `drive` nem `drive.appdata`.
   - **Publishing status**: carrega em **Publish app** para passar a **In production**. Em *Testing*, só os utilizadores de teste listados conseguem entrar e **a ligação expira ao fim de 7 dias**.
5. **Cliente OAuth** (**Clients → Create client**):
   - **Application type**: **Web application**. Não escolher outro tipo: só este tem segredo e endereços de regresso.
   - **Name**: `Wattometro web`.
   - **Use this client for an AI-powered agent**: desmarcado.
   - **Authorized redirect URIs**: `https://app.wattometro.workers.dev/nuvem-retorno` e `http://localhost:5173/nuvem-retorno`.
   - **Authorized JavaScript origins**: não é preciso (a troca do código é feita pelo Worker).
   - **Create**. Copia o **Client ID** e o **Client secret**. O segredo pode não voltar a aparecer por inteiro: se o perderes, cria um novo no mesmo cliente.
6. **Pôr o segredo no Worker** (uma vez; a conta do `wrangler` é a do Cloudflare do Wattómetro):

   ```bash
   pnpm wrangler secret put GOOGLE_CLIENT_SECRET --config server/wrangler.toml   # cola o Client secret
   ```

   O segredo fica ativo logo, sem novo deploy. Para o servidor local (`pnpm dev:server`), põe `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` em `server/.dev.vars`, que está no `.gitignore`.
7. **Pôr o Client ID** em `GOOGLE_CLIENT_ID` de `server/wrangler.toml`  e na app: `PROJECT_GOOGLE_CLIENT_ID` em `src/cloud/cloud-config.ts` (commit), ou `VITE_GOOGLE_CLIENT_ID` no `.env.local` para testar sem commitar. Faz o deploy do `api` para o `wrangler.toml` valer.

## Testar

1. `pnpm dev` (e `pnpm dev:server` com o `.dev.vars`). Os endereços `http://localhost:5173/nuvem-retorno` estão registados e o Worker aceita-os.
2. "Usar sem conta", importa o CSV da E-Redes e, em Definições › Dados, **Ligar ao Google Drive**. Abre a página da Google, que pede autorização e volta a `/nuvem-retorno`. A app retoma nas Definições e pede a palavra-passe da cloud.
3. No Google Drive, em **O meu disco**, deve existir a pasta `Wattometro`, com `chave.json` e `casas/`.
4. Noutro browser (janela anónima): **Tenho a casa na cloud → Do Google Drive**. Com a mesma palavra-passe, os dados chegam. Isto confirma que a permissão `drive.file` deixa a app encontrar a pasta criada noutro aparelho.
5. Cópia automática: aparece em `copias/` na primeira sincronização (e depois uma por semana, se a casa mudar).

Ainda não testado com uma conta Google real (falta o registo).

## O que fica guardado e onde

- No browser: a ligação duradoura (*refresh token*) no IndexedDB, em texto simples (a mesma proteção do `refresh token` da Microsoft no `localStorage`; cifrá-lo com a chave mestra guardada ao lado não acrescentaria nada). Logo após a entrada, antes de a ligação existir, fica só na `sessionStorage` do separador. O acesso de curta duração (1 hora) fica só em memória.
- No Worker: só o segredo da app e o Client ID. Os pedidos de entrada e de renovação passam sem serem guardados nem registados.
- Na pasta `Wattometro` do Drive: `chave.json`, `casas/` (um ficheiro cifrado por aparelho) e `copias/`. A pasta é visível no Drive do utilizador. Se o utilizador a apagar ou mudar de sítio, a app cria uma nova (vazia) no próximo envio.
- O cabeçalho CSP (`security-headers.ts`) autoriza `www.googleapis.com`; a página de entrada da Google é uma navegação de página inteira, não precisa de entrada.
