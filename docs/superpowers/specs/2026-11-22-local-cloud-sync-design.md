# Modo sem conta: sincronização e cópias no OneDrive do utilizador

Aprovado no chat a 2026-11-22: a mesma cifra do Faturómetro (chave mestra embrulhada pela palavra-passe e por uma chave de recuperação) e a abordagem 1 (um ficheiro por dispositivo).

## Porquê

O modo sem conta (`docs/local-mode.md`) guarda a casa só num browser: não há sincronização entre aparelhos e a cópia é manual (descarregar um JSON, com aviso aos 30 dias). O utilizador quer, como no Faturómetro, que a casa possa estar no telemóvel e no PC e que as cópias se façam sozinhas, **numa cloud sua**, sem conta no Wattómetro e sem ocupar o espaço da Cloudflare. É também o que reforça a recomendação de `docs/hosting.md`: divulgar pelo modo local, gratuito e sem limite de pessoas.

As casas com Shelly ficam como estão (os dados nascem no Worker; ver a análise no chat de 2026-11-22). Google Drive e Dropbox vêm depois, como mais implementações da mesma interface.

## Objetivos

- No modo sem conta, ligar a casa ao OneDrive do utilizador; os outros aparelhos ligados à mesma pasta ficam com a mesma casa.
- Tudo cifrado no browser antes de sair; o OneDrive só guarda dados ilegíveis.
- Num aparelho novo: "Usar sem conta" → entrar no OneDrive → palavra-passe (ou chave de recuperação) → a casa aparece.
- Cópias automáticas datadas no OneDrive, com as últimas N guardadas, e repor uma delas a partir das Definições.
- A app continua a funcionar sem cloud nenhuma, exatamente como hoje.

## Fora de âmbito

- Google Drive e Dropbox (só a interface preparada, copiada do Faturómetro).
- Casas com conta / Shelly (os dados continuam no D1).
- Passar uma casa do modo sem conta para uma conta com servidor (ou o contrário).
- Limpar da pasta os ficheiros de aparelhos que deixaram de existir (não causa erros).
- Cópias com a app fechada (uma app web não o faz de forma fiável).
- Mudar a palavra-passe da cloud: primeira versão sem isso (ver "Deixado a quem implementa").

## Anti-objetivos

- Qualquer dado da casa em claro no OneDrive, ou a chave mestra sem estar embrulhada.
- Perder alterações quando dois aparelhos mudam a casa ao mesmo tempo, ou um aparelho antigo desfazer o que outro gravou depois.
- Um aparelho com dados ilegíveis (`LocalRead` `unreadable`) ou de uma versão mais recente a escrever por cima da cloud.
- Passar pelo Worker do Wattómetro para falar com a Microsoft (tokens ou dados).
- Falhar em silêncio: ligação expirada, OneDrive cheio ou junção recusada têm de aparecer ao utilizador.

## Restrições

- **Regra 1 do CLAUDE.md** passa a incluir, só quando o utilizador liga o OneDrive no modo sem conta: `https://login.microsoftonline.com` (entrada) e `https://graph.microsoft.com` (ficheiros), mais os anfitriões de descarregamento do OneDrive. A lista do Faturómetro (`ONEDRIVE_ORIGINS` no `security-headers.ts` de lá: `https://*.files.1drv.com`, `https://*.livefilestore.com`, `https://my.microsoftpersonalcontent.com`, `https://*.sharepoint.com`) serve de ponto de partida; confirmar num teste real e não alargar. Atualizar o CLAUDE.md (regra 1 e Stack), `security-headers.ts` (`connect-src`; `frame-src` com `login.microsoftonline.com` para a renovação silenciosa) e `docs/local-mode.md` ("Não há: sincronização entre aparelhos" sai da tabela).
- **App própria no Microsoft Entra**, registada pelo responsável (gratuito), com o nome "Wattómetro": a pasta do utilizador é `Aplicações/Wattómetro`. Não reutilizar a do Faturómetro (a pasta seria a do Faturómetro). O id (`VITE_ONEDRIVE_CLIENT_ID` ou constante em `src/cloud/cloud-config.ts`) é público. Tipo SPA, regresso a `https://app.wattometro.workers.dev/auth-redirect.html` e `http://localhost:5173/auth-redirect.html`. Passo a passo em `docs/onedrive.md` (adaptado de `faturometro/docs/onedrive.md`). Sem id, a opção não aparece.
- **Permissões:** só `Files.ReadWrite.AppFolder` e `offline_access`.
- **Microsoft para SPAs:** o acesso duradouro dura 24 h; depois a renovação silenciosa pode falhar e é preciso um clique em "Ligar de novo ao OneDrive". As alterações ficam no browser até lá.
- **`Cross-Origin-Opener-Policy: same-origin`** (já em `security-headers.ts`): entrada por redirecionamento de página inteira, não por janela, como o Faturómetro descobriu.
- O formato da casa local (`LocalData`, `LOCAL_VERSION` 3) **não muda**: os carimbos ficam à parte (ver "O que vai em cada fotografia"), por isso `stored.test.ts` passa sem ser editado.
- Sem `any`; tudo o que vem da cloud validado com zod; textos em `src/i18n/pt-PT/`; SPDX em cada ficheiro novo.

## Abordagens

1. **Um ficheiro por aparelho (escolhida).** Cada aparelho grava só a sua fotografia completa da casa, cifrada; ao sincronizar lê as dos outros e junta-as. Dois aparelhos nunca escrevem o mesmo ficheiro, por isso não há conflitos de escrita; é o princípio do Faturómetro. Reenvia a casa inteira a cada alteração, mas são centenas de KB (um ano de E-Redes ≈ 700 KB de JSON antes de cifrar) e só quando a casa muda.
2. Um ficheiro único partilhado, lido, junto e gravado com `ifMatch`: menos ficheiros, mas um aparelho antigo (ou uma versão antiga da app) estraga a casa de todos de uma vez. Rejeitada.
3. O protocolo de alterações do Faturómetro (`sync-protocol.ts`: ficheiros numerados e compactação): feito para milhares de registos; aqui seria complexidade sem ganho. Rejeitada.

Cifra: a do Faturómetro, escolhida pelo utilizador ("aplica a mesma solução"); a palavra-passe, que lá é a da conta, aqui é criada ao ligar a cloud.

## Desenho

### O que se copia do Faturómetro

Copiar mantendo a fonte num comentário, com SPDX:

- `src/lib/crypto.ts` (e `src/lib/base32.ts`): chave mestra AES-GCM 256, embrulho por palavra-passe (PBKDF2-SHA256, 600 000 iterações) e por chave de recuperação (HKDF), `encryptBytes`/`decryptBytes`. Só as funções usadas; os testes vêm com elas.
- `src/cloud/drive.ts` (`CloudDrive`, `CloudError`, `readJson`/`writeJson`), `onedrive.ts`, `onedrive-auth.ts` (MSAL por redirecionamento, carregado só quando se usa), `auth-redirect.ts`, `memory-drive.ts`, `fake-fetch.ts`, `providers.ts`/`cloud-config.ts` reduzidos ao OneDrive, e os seus testes.
- `auth-redirect.html` **na raiz do repositório**, como segunda entrada do Vite (`build.rollupOptions.input` com `'auth-redirect'`, como no `vite.config.ts` do Faturómetro), porque carrega `src/cloud/auth-redirect.ts`; `navigateFallbackDenylist` do `vite-plugin-pwa` passa a incluir `/^\/auth-redirect\.html/` (hoje só tem `/v1`); `AUTH_REDIRECT_PATH` em `security-headers.ts`. Sem resposta da Microsoft, a página volta para a rota do Wattómetro de onde se saiu (no Faturómetro vai para `/app`, que aqui não existe).
- Dependência `@azure/msal-browser` (a versão fixa do Faturómetro).

Não se copiam `sync-protocol.ts`, `cloud-account.ts`, `cloud-run.ts` nem `migrate.ts`: dependem da conta, dos registos e do servidor do Faturómetro.

### Pasta `Aplicações/Wattómetro`

```
chave.json                         chave mestra embrulhada (palavra-passe e chave de recuperação); sem email
casas/<deviceId>.bin               fotografia da casa deste aparelho, cifrada
copias/wattometro-<AAAA-MM-DD>-<dispositivo>.bin cópias automáticas, cifradas
```

- `chave.json`: `{ format: 'wattometro-cloud-key', version: 1, keyId: UUID, wrappedKey: { byPassword, kdf, byRecoveryKey, recoverySalt } }`, validado com zod (forma de `cloud-account.ts` do Faturómetro, sem `email`, com `keyId`). Escrito com `ifNoneMatch: '*'`; se já existir, junta-se a ele (nunca se escreve por cima).
- `.bin`: JSON com o cabeçalho e o `EncryptedBlob` (`{ iv, data }`) abaixo, cifrado com a chave mestra. Cada ficheiro tem um IV novo.
- `deviceId`: UUID aleatório deste browser, criado ao ligar.

### O que vai em cada fotografia

O ficheiro tem um cabeçalho em claro e o conteúdo cifrado:

```ts
{
  format: 'wattometro-local-house',
  keyId: string,                 // o de chave.json (ver "Chave apagada ou trocada")
  blob: EncryptedBlob,           // cifrado com a chave mestra:
}
// conteúdo do blob:
{
  version: LOCAL_VERSION,        // a do formato da casa
  deviceId, writtenAt,           // epoch s
  data: LocalData,               // a casa como está neste browser, já junta
  meta: SyncMeta,
}
// SyncMeta:
{
  stamps: Record<Section, number>,          // epoch s da última alteração de cada secção; 0 = nunca
  quartersGeneration: { id: string, at: number }, // { id: '', at: 0 } até alguém apagar ou repor
}
```

Secções: `quarters`, `tariffs`, `zone`, `location`, `budget`, `installation` e `equipment` (**equipamentos e "sempre ligado" são uma só secção**: `server.ts` muda os dois na mesma escrita com `relinkAlwaysOn`, e juntá-los separados deixaria ligações a equipamentos que já não existem).

**`SyncMeta` fica fora de `LocalData`** (decisão do desenho): numa segunda chave (`meta`) do mesmo object store de `src/local/store.ts`, gravada na **mesma transação** que a casa (`LocalStore.save(data, meta)`; `load()` devolve os dois). Assim `LOCAL_VERSION`, `MIGRATIONS`, `emptyLocalData()`, o formato da cópia manual e os testes de `stored.test.ts` não mudam. Sem `meta` guardada, vale a meta vazia (`stamps` a 0, geração `{ '', 0 }`), que é determinística. `src/local/server.ts`, em cada escrita, carimba com a hora atual a secção que mudou; assim os carimbos existem também sem cloud.

### Juntar

Função pura `mergeHouses(mine, theirs[]) → { data, stamps, generation }` em `src/local/merge.ts`, com testes à mão:

1. **Quartos de hora:** ganha a `quartersGeneration` mais recente (`at`, e em empate o `id`); os quartos das fotografias de gerações mais antigas são ignorados. Na mesma geração, união pela hora de início; a mesma hora com valores diferentes fica com o da fotografia cujo carimbo `quarters` é mais recente (como `withQuarters`: o lote mais recente ganha). Só **apagar os dados da E-Redes** (`DELETE /v1/import/eredes`) e **repor uma cópia** criam uma geração nova (`{ id: UUID, at: agora }`); é assim que essas ações chegam aos outros aparelhos sem os quartos antigos voltarem pela união.
2. **Outras secções:** ganha a secção inteira com o carimbo mais recente; em empate de carimbos diferentes de 0, o `deviceId` maior, para todos chegarem ao mesmo resultado. Apagar um tarifário ou um equipamento é uma alteração da secção, por isso propaga-se. Uma secção com carimbo 0 (nunca mudada desde que há carimbos) perde para qualquer outra com carimbo.
3. Os carimbos vêm do relógio de cada aparelho; um relógio errado faz esse aparelho ganhar ou perder. Aceite (uso familiar); para não piorar, um carimbo recebido mais de 1 dia no futuro conta como `agora`.
4. Fotografias de uma `version` mais recente do que a desta app não se juntam: a sincronização pára com "Atualiza a app neste aparelho" (a app em cache recarrega-se). Fotografias de versões antigas passam por `MIGRATIONS` antes de juntar.
5. Uma fotografia que não se decifra ou não passa no zod conta como erro desse aparelho, não pára os outros, e aparece como aviso ("Um aparelho tem dados que não se conseguem ler").

O resultado é o mesmo em todos os aparelhos, seja qual for a ordem.

### Sincronizar

Estado deste browser (IndexedDB próprio, `wattometro-cloud`, separado da casa): `{ provider: 'onedrive', deviceId, keyId, masterKey, accountId, accountLabel, lastSyncAt?, lastPushedStamp? }`. A `masterKey` é a do Faturómetro depois de desembrulhada (extraível, como lá) **reimportada como não extraível** antes de a guardar (`CryptoKey` no IndexedDB). Mudar a palavra-passe pede por isso a atual (ou a chave de recuperação) para a desembrulhar de novo.

Um ciclo (`src/local/cloud-sync.ts`, sobre `CloudDrive` e `LocalStore`, sem `fetch` próprio):

0. Ler `chave.json`. Se não existir ou o `keyId` for outro (alguém apagou a casa da cloud, ou ligou outra), **desligar este aparelho** (apagar o estado deste browser, a casa local fica) e avisar: "A casa no OneDrive foi apagada ou substituída. Liga de novo para continuar." Nunca escrever `casas/` com uma chave que já não é a da pasta. Fotografias com outro `keyId` no cabeçalho são ignoradas sem as tentar decifrar.
1. Ler a casa local. Se `unreadable` (ou de versão mais recente), parar sem escrever nada e avisar, como hoje (`src/local/stored.ts`).
2. Listar `casas/`, ler e decifrar as fotografias dos outros aparelhos que mudaram desde a última leitura (pelo `etag`).
3. `mergeHouses`. Se o resultado for diferente da casa local, gravá-lo pelo mesmo caminho de escrita do `server.ts` (relê, uma escrita de cada vez, Web Locks) e avisar a página (`LOCAL_CHANGED`).
4. Se a casa (já junta) for diferente da última fotografia enviada, gravar `casas/<eu>.bin`.
5. Cópia automática, se for altura (abaixo).

Quando corre: ao abrir a app, alguns segundos depois de cada escrita local (agrupando as escritas próximas), de 5 em 5 minutos com a app aberta e quando a ligação volta. Um ciclo de cada vez entre separadores (Web Locks). Erros `throttled` respeitam `Retry-After`; `offline` tenta de novo quando a ligação volta; `needs_reconnect` e `quota_full` mostram-se na faixa do topo (`LocalBanner`).

### Ligar (primeiro aparelho)

Definições › Dados › "Sincronizar com o meu OneDrive":

1. Entrar na Microsoft (redirecionamento; ao voltar, continua no mesmo passo).
2. Sem `chave.json` na pasta: pedir uma palavra-passe (duas vezes, mínimo como o login da app), criar a chave mestra e a chave de recuperação, gravar `chave.json`, mostrar a chave de recuperação com "Copiar" e "Já a guardei" (não se avança sem confirmar). Depois, primeiro ciclo.
3. Com `chave.json` (a pasta já tem uma casa): é o caso "aparelho novo".

### Aparelho novo

Na página de entrada, em "Usar sem conta", também "Tenho a casa no OneDrive"; e em Definições › Dados quando já se usa o modo sem conta.

1. Entrar na Microsoft → ler `chave.json` → pedir a palavra-passe (ou "Usar a chave de recuperação") → desembrulhar a chave mestra.
2. Se este browser não tiver casa com dados (`empty`, ou o `localStatus` diz `empty`): a casa da cloud entra tal como está, com a meta da cloud.
3. Se já tiver uma casa com dados: perguntar
   - **"Juntar as duas casas":** a casa deste browser adota a `quartersGeneration` da cloud (os seus quartos entram na união) e as suas secções ficam com carimbo 0, exceto as que a cloud ainda não tem (carimbo 0 lá e dados aqui), que ficam com `agora`. Assim a cloud ganha em tudo o que já tinha e esta casa só acrescenta.
   - **"Ficar com a da cloud":** a casa deste browser é descarregada primeiro como cópia manual e depois substituída.
4. Ligar o primeiro aparelho com uma casa migrada (meta vazia): todas as secções com dados ficam com `agora`, para uma casa vazia ligada depois não ganhar.
5. Palavra-passe errada: mensagem clara, sem limite de tentativas (a chave fica na cloud do próprio utilizador).

### Repor e apagar

- **Repor cópia** (ficheiro manual ou cópia da cloud) e **Apagar os dados deste browser** com a cloud ligada mudam a casa de todos os aparelhos: confirmação a dizer isso. Repor cria uma `quartersGeneration` nova (os quartos de hora dos outros aparelhos não voltam a aparecer) e carimba todas as secções com `agora`. Apagar os dados da E-Redes (Importar) também cria uma geração nova, com a mesma confirmação.
- **Apagar os dados deste browser** com a cloud ligada oferece duas opções: "Só deste browser" (desliga a cloud aqui e apaga a casa local; os outros aparelhos e a cloud ficam como estão) ou "Também da cloud" (apaga `casas/`, `copias/` e `chave.json`, depois de escrever "apagar").
- **Desligar** (Definições › Dados): apaga `casas/<eu>.bin` e o estado deste browser; a casa local fica.

### Cópias automáticas

- **Calendário partilhado:** no fim de um ciclo, listar `copias/`; se a cópia mais recente (de qualquer aparelho) tiver mais de 7 dias e a casa mudou desde então, gravar `copias/wattometro-<AAAA-MM-DD>-<deviceId 8 primeiros>.bin` (a fotografia já junta, cifrada, com o cabeçalho e o `keyId`). O `deviceId` no nome faz com que dois aparelhos no mesmo dia nunca escrevam o mesmo ficheiro. Depois apagar as mais antigas para além das 8 mais recentes, no total. Só se apagam ficheiros com esse padrão de nome.
- `markBackup` conta a cópia na cloud: a faixa do topo deixa de pedir a cópia manual enquanto a cloud estiver a funcionar, e volta a pedi-la se a cloud estiver parada há mais de 30 dias.
- Definições › Dados: lista das cópias na cloud (data e tamanho) com "Repor" (como acima).
- A cópia manual (JSON em claro) continua igual.

### Interface

Definições › Dados, no modo sem conta:

```
Sincronizar e guardar no teu OneDrive
A casa fica numa pasta tua, cifrada com uma palavra-passe que só tu sabes.
[Ligar ao OneDrive]

-- ligado --
OneDrive de <conta> · última sincronização há 2 min
[Sincronizar agora]  [Desligar]
Cópias no OneDrive: 22/11/2026 · 15/11/2026 · …   [Repor]
```

Faixa do topo: "Ligar de novo ao OneDrive" (um clique), "OneDrive cheio", "Atualiza a app", "Um aparelho tem dados que não se conseguem ler". Botões com as classes de `buttons.css`. Textos num ficheiro novo `src/i18n/pt-PT/cloud.ts`.

### Testes

- `merge.ts`: casos à mão para cada regra (dois aparelhos com quartos diferentes; o mesmo quarto com valores diferentes; secção mais recente ganha; carimbo 0 perde; apagar um tarifário propaga; apagar a E-Redes e repor (geração nova) não deixam voltar os quartos antigos; apagar um equipamento não deixa "sempre ligado" a apontar para ele; carimbo no futuro; ordem das fotografias não muda o resultado; versão mais recente recusada; versão antiga migrada).
- `cloud-sync.ts` com `memory-drive`: dois aparelhos a escrever ao mesmo tempo sem perder nada; casa `unreadable` não escreve; fotografia corrompida não pára as outras; `chave.json` apagado ou com outro `keyId` desliga o aparelho sem escrever; "Juntar as duas casas" acrescenta sem tirar nada à cloud; casa vazia ligada depois não apaga a da cloud; cópias (calendário partilhado, dois aparelhos no mesmo dia, 8 guardadas, só os nomes da app apagados); `throttled`, `needs_reconnect`, `quota_full`.
- `store.ts`: casa e meta gravadas na mesma transação; sem meta, a meta vazia.
- Chave: palavra-passe certa e errada, chave de recuperação, `chave.json` existente nunca é reescrito, chave guardada não extraível.
- Os testes copiados do Faturómetro (OneDrive com `fetch` falso, crypto).
- `security-headers.test.ts`: os anfitriões novos e só esses.
- Teste manual com uma conta Microsoft real antes de publicar: ligar, segundo aparelho (telemóvel), alteração nos dois, expirar e reconectar, repor uma cópia, desligar. Confirmar aí os anfitriões de descarregamento.

### Documentação

CLAUDE.md (regra 1 e Stack), `docs/local-mode.md` (secção nova "Sincronizar pelo OneDrive" e tabela), `docs/onedrive.md` (registo no Entra), `planning/plan.md` (tarefas e decisão na secção "Decisões").

## Deixado a quem implementa

- Tempo de espera após uma escrita antes de sincronizar (proposta: 10 s) e a forma de comparar "casa mudou desde a última fotografia" (proposta: o maior carimbo).
- Onde o MSAL guarda a sua cache (proposta: `localStorage`, como no Faturómetro; só dá acesso à pasta da app, onde tudo está cifrado).
- Mudar a palavra-passe (reembrulhar e gravar `chave.json` com `ifMatch`) e gerar nova chave de recuperação: podem entrar na primeira versão se forem baratos; senão, ficam para depois.
- Ordem de implementação e divisão em tarefas.
