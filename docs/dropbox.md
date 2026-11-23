# Dropbox: registo da app

A sincronização do modo sem conta pelo Dropbox (`docs/local-mode.md`) precisa de uma app registada na consola de programadores do Dropbox. Faz-se **uma vez, pelo responsável**. Os utilizadores não fazem nada disto: só carregam em "Ligar ao Dropbox" e aceitam o pedido do Dropbox. A *App key* que daí sai **não é secreta**, porque só identifica a app na página de entrada. A app não usa o *App secret*: é um cliente público com PKCE. Adaptado do Faturómetro (`docs/dropbox.md` de lá).

Sem *App key*, a app não mostra a opção Dropbox e tudo o resto funciona igual.

**Registo atual:** ainda por fazer (2026-11-23). Quando estiver feito, anota aqui a data e a App key (não é secreta). Não ponhas no repositório (público) o email da conta da consola nem outros dados pessoais.

## Passos (consola em inglês)

Os nomes dos menus podem mudar com o tempo; se algum não bater certo, procura o equivalente.

1. Entra em <https://www.dropbox.com/developers/apps> com a conta Dropbox que vai gerir a app. Qualquer conta serve: os utilizadores ligam a sua própria conta.
2. **Create app**:
   - **Choose an API**: **Scoped access**.
   - **Choose the type of access you need**: **App folder**. A app só vê a sua pasta (Aplicações/<nome da app>), nunca o resto do Dropbox do utilizador.
   - **Name your app**: `Wattometro` (sem acento). É o nome da pasta e o que o utilizador vê ao dar autorização: a pasta fica `Aplicações/Wattometro` (`Apps/Wattometro` no Dropbox em inglês).
   - **Create app**.
3. Separador **Permissions**: marca `files.metadata.read`, `files.content.read`, `files.content.write` e `account_info.read` (este último dá o email que aparece nas Definições) e carrega em **Submit**. Na secção **OpenID Scopes** (`profile`, `openid`, `email`) não marques nada. As permissões têm de estar escolhidas **antes** de os utilizadores ligarem; quem ligou antes de uma mudança tem de ligar de novo.
4. Separador **Settings**:
   - **OAuth 2 → Redirect URIs**: acrescenta `https://app.wattometro.workers.dev/nuvem-retorno` e `http://localhost:5173/nuvem-retorno` (um de cada vez, com **Add**).
   - **Allow public clients (Implicit Grant & PKCE)**: **Allow**. Sem isto, a troca do código falha.
   - Copia a **App key** para `PROJECT_DROPBOX_APP_KEY` em `src/cloud/cloud-config.ts`, ou põe `VITE_DROPBOX_APP_KEY` no `.env.local` para testar sem commitar. Não copies o *App secret* para lado nenhum.
5. **Estado da app**: começa em *Development*, o que chega para testar e permite ligar até 500 contas. Quando a app passar das 50 contas, o Dropbox dá duas semanas para pedir **Apply for production** (no separador **Settings**); depois disso, deixa de aceitar contas novas até ser aprovada.

## Testar

1. `pnpm dev`, com a chave em `src/cloud/cloud-config.ts` ou em `.env.local`.
2. "Usar sem conta", importa o CSV da E-Redes e, em Definições › Dados, **Ligar ao Dropbox**. Abre a página do Dropbox, que pede autorização e volta a `/nuvem-retorno`. A app retoma nas Definições e pede a palavra-passe da cloud.
3. No Dropbox (site ou programa), confirma que existe `Aplicações/Wattometro` com `chave.json` e `casas/`.
4. Noutro browser (janela anónima): **Tenho a casa na cloud → Do Dropbox**. Com a mesma palavra-passe, os dados chegam.
5. Cópia automática: aparece em `copias/` na primeira sincronização (e depois uma por semana, se a casa mudar).

Ainda não testado com uma conta Dropbox real (falta o registo).

## O que fica guardado e onde

- No browser: a ligação duradoura (*refresh token*) no IndexedDB, em texto simples (a mesma proteção do `refresh token` da Microsoft no `localStorage`). Logo após a entrada, antes de a ligação existir, fica só na `sessionStorage` do separador. O acesso de curta duração (4 horas) fica só em memória.
- No servidor do Wattómetro: nada. A troca do código e as renovações vão diretas do browser para `api.dropboxapi.com`.
- O cabeçalho CSP (`security-headers.ts`) autoriza `api.dropboxapi.com` e `content.dropboxapi.com`; a página de entrada do Dropbox é uma navegação de página inteira, não precisa de entrada.
