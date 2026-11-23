# Modo sem conta (local)

Para quem só tem o ficheiro da E-Redes e não quer conta: na página de entrada, "Usar sem conta". Decidido a 2026-10-29 (`planning/plan.md`, Decisões; capacidade e alternativas em `docs/hosting.md`).

## Como funciona

- **A casa fica neste browser.** Uma base IndexedDB própria (`wattometro-local`, `src/local/store.ts`) guarda um só registo: os quartos de hora da E-Redes, os tarifários, a zona de qualidade, a localidade, o orçamento, a instalação, a lista do que está sempre ligado e o registo dos equipamentos (`src/local/data.ts`; sem Shelly não há aparelhos reconhecidos para ligar). É separada das caches: "Sair" não a apaga.
- **Nada vai para o servidor.** `src/local/server.ts` responde no browser às mesmas rotas `/v1/...` que o Worker, com as mesmas formas de resposta, para uma casa sem Shelly (como a demonstração, `src/demo/server.ts`). As páginas e `src/app/api.ts` não mudam.
- **Volta sozinho.** O modo fica marcado neste browser (`localStorage`); ao abrir a app outra vez, entra nele.
- **Armazenamento persistente.** A app pede-o ao browser (`navigator.storage.persist()`) só quando já há dados e de novo em cada abertura, enquanto não for concedido: os browsers tendem a aceitar mais depressa uma app já usada ou instalada. O browser pode recusar.
- **Cópia.** Em Definições › Dados: "Guardar cópia" descarrega um ficheiro JSON (o mesmo formato, com versão, validado com zod ao repor); "Repor cópia" substitui a casa deste browser; "Apagar os dados deste browser" remove-a, com a chave de IA e o registo de gastos.
- **Lembrete.** A faixa do topo mostra a data da última cópia (a do descarregamento: a app não sabe se o ficheiro foi guardado). Avisa quando há dados e nunca houve cópia, ou quando a cópia tem mais de 30 dias e a casa mudou desde então (`src/local/backup.ts`). Sem alterações não há aviso, por mais antiga que seja a cópia. Repor uma cópia conta como cópia. Com o OneDrive ligado (abaixo), a sincronização também conta como cópia: enquanto a cloud sincronizar sem erro duradouro e a última sincronização tiver menos de 30 dias, não há lembrete (`cloudWorking` em `src/local/cloud-runner.ts`).

## Sincronizar pelo OneDrive, Google Drive ou Dropbox

Opcional, em Definições › Dados (só aparecem os serviços cujo id a app tem: `docs/onedrive.md`, `docs/google-drive.md`, `docs/dropbox.md`). Cada casa liga-se a **um** serviço de cada vez, e os ficheiros e o protocolo são os mesmos nos três (o texto abaixo diz OneDrive, mas vale para os outros: a pasta é `Wattometro` no Google Drive e `Apps/Wattometro` no Dropbox). Decidido a 2026-11-22 (`planning/plan.md`, Decisões). Sem isto, tudo funciona como antes, só com a casa neste browser.

- **Ligar.** "Ligar ao OneDrive" abre a página da Microsoft (por redirecionamento) e, ao voltar, a app vê a pasta da app (`Aplicações/Wattometro`). Se ainda não tem casa, pede uma **palavra-passe da cloud** (mínimo 12 caracteres; não é a da Microsoft e a app não a guarda) e mostra uma **chave de recuperação**, para guardar num sítio seguro. Uma das duas abre a casa noutro aparelho; sem as duas, ninguém lê os dados, nem o dono. A casa é cifrada no browser com a cifragem do Faturómetro (chave mestra embrulhada pela palavra-passe e pela chave de recuperação, em `chave.json`).
- **Aparelho novo.** Na página de entrada, "Tenho a casa no OneDrive": entra na Microsoft, escreve a palavra-passe (ou usa a chave de recuperação) e abre a casa; se a pasta ainda não tem casa, diz-o. Num browser que já tem uma casa com dados (em qualquer secção, nem que sejam só os equipamentos), pergunta-se o que fazer: **juntar as duas casas** (acrescenta o que falta na cloud; o que a cloud já tem fica) ou **ficar com a da cloud** (descarrega antes uma cópia da casa deste browser e substitui-a). Se a pasta não tiver nenhuma casa que se consiga ler, "ficar com a da cloud" recusa e a casa deste browser fica como está.
- **O que há na pasta.** `chave.json`; `casas/`, um ficheiro cifrado por aparelho (cada aparelho só escreve o seu e lê os dos outros); `copias/`, as cópias datadas.
- **Como se juntam as casas**, por palavras simples:
  - os **quartos de hora** da E-Redes juntam-se pelo início do intervalo: um que só um aparelho tem fica em todos, e se dois têm o mesmo ganha o de alteração mais recente;
  - **cada uma das outras secções** (tarifários, zona de qualidade, localidade, orçamento, instalação, equipamentos) fica inteira com a versão da alteração mais recente;
  - os **equipamentos e o "sempre ligado"** andam juntos, porque um aponta para o outro;
  - **apagar os dados da E-Redes** ou **repor uma cópia** vale para todos os aparelhos: é uma alteração mais recente que tudo o que eles tinham;
  - uma alteração (ou uma reposição) feita com o relógio adiantado mais de um dia conta como feita "agora": deixa de ganhar quando o relógio é corrigido e há uma alteração mais recente.
- **Quando sincroniza.** Ao abrir a app, 10 s depois da última alteração (várias seguidas fazem um só ciclo), de 5 em 5 minutos com a app aberta, quando a internet volta e em "Sincronizar agora". Um separador de cada vez (Web Locks). Se a Microsoft pedir para esperar (`Retry-After`), nada corre até lá. O ficheiro do aparelho só é enviado quando a casa mudou desde o último envio.
- **Cópias automáticas.** Uma cópia datada em `copias/` quando a mais recente (de qualquer aparelho) tem 7 dias e a casa mudou desde então, ou quando há casa e ainda não há nenhuma; ficam as 8 mais recentes. Em Definições › Dados, "Cópias no OneDrive" lista-as e "Repor" substitui a casa em todos os aparelhos ligados (com confirmação).
- **Faixa do topo.** "Sem conta: a casa sincroniza com o teu OneDrive. Última sincronização: …" e os avisos: a ligação expirou (com "Ligar de novo ao OneDrive"); o OneDrive está cheio; outro aparelho tem uma versão mais recente da app (atualizar este); um aparelho tem dados ilegíveis (os outros continuam); a casa na cloud foi apagada ou substituída (com "Ligar de novo"); qualquer outro erro que dure (por exemplo um `chave.json` danificado) diz que não foi possível sincronizar e manda ver Definições › Dados. Uma falha passageira (sem rede, Microsoft a pedir para esperar) não tira a contagem como cópia.
- **Não se perde nada por engano.** Uma casa deste browser que não se consegue ler nunca é enviada nem escrita por cima (continua o aviso de "Não perder dados"), e uma casa gravada por uma app mais recente não é tocada.
- **Desligar.** Tira este browser da sincronização: apaga a fotografia deste aparelho da pasta e esquece a sessão da Microsoft aqui; a casa fica neste browser e na cloud, e os outros aparelhos continuam. Se o OneDrive não responder, o browser fica desligado na mesma e a fotografia dele fica na pasta. No Dropbox e no Google Drive, desligar só faz este browser esquecer o acesso; para o revogar por completo, remove a app nas definições da conta do serviço (aplicações ligadas).
- **Apagar.** "Apagar os dados deste browser", com o OneDrive ligado, pergunta: **só deste browser** (a cloud e os outros aparelhos ficam como estão) ou **também da cloud** (a casa, as cópias e a chave, para todos os aparelhos; pede para escrever "apagar"; começa pela chave, por isso, se o OneDrive deixar de responder a meio, a casa na cloud pode ficar apagada só em parte, este browser não é apagado e podes tentar outra vez). Apagar os consumos da E-Redes em Importar também vale para todos os aparelhos.
- **Limites.** A Microsoft só renova a sessão de uma app de página única durante 24 h; depois, "Ligar de novo ao OneDrive". A palavra-passe da cloud não se recupera: só a chave de recuperação a substitui. O Dropbox e o Google Drive guardam a ligação duradoura (*refresh token*) no IndexedDB deste browser, em texto simples, com a mesma proteção do da Microsoft no `localStorage`; o acesso de curta duração fica só em memória. **Exceção à regra de não ir nada ao servidor:** a Google só dá acesso duradouro a quem tem o segredo do cliente, por isso a troca do código e as renovações do Google Drive passam pelo Worker (`POST /v1/google/token`), que junta o segredo e reencaminha para a Google. Passam só os códigos e os tokens, nunca dados da casa, e o Worker não guarda nem regista nada. Se o Worker não tiver o segredo, o Google Drive não funciona (404). O Dropbox não passa pelo servidor.
- **Casas com Shelly** (conta) continuam no D1, na Cloudflare; isto é só para o modo sem conta.

## Não perder dados

- **O que não se consegue ler não é uma casa vazia** (`src/local/stored.ts`). Se a leitura falhar, se os dados não passarem na validação ou se forem de uma versão mais recente que a app em cache, a app recusa gravar (a rota responde 423), avisa no topo e, em Definições › Dados, deixa descarregar os dados como estão. Só "Repor cópia" e "Apagar" escrevem por cima, com confirmação. Cada pedido volta a tentar ler, por isso uma falha momentânea passa sozinha.
- **Mudar o formato:** subir `LOCAL_VERSION` e acrescentar um passo a `MIGRATIONS` em `src/local/stored.ts`, que corre ao abrir a casa e ao repor uma cópia antiga. Os esquemas do tarifário, do orçamento e da instalação são partilhados com a API: o teste com uma casa da versão 1 (`src/local/stored.test.ts`) falha se uma mudança neles deixar de ler o que as pessoas já têm. Esse teste não se edita: uma falha nele pede uma versão nova e uma migração.
- **Vários separadores.** Cada escrita relê a casa antes de a alterar e as escritas fazem-se uma de cada vez (entre separadores, com Web Locks onde existir), por isso um separador antigo não desfaz o que outro gravou. Quando outro separador grava, este esquece o que tinha em memória e atualiza a faixa; a página aberta mostra os dados novos no pedido seguinte (ao mudar de página).
- **Gravar só conta quando a transação termina** (`oncomplete`), não quando o pedido é aceite.

## O que há e o que não há

| Funciona | Não há (precisa do servidor ou do Shelly) |
|---|---|
| Tarifários: ofertas da ERSE, indexadas (ficheiro OMIE servido com a app), tarifa social, carro elétrico | Painéis solares: o PVGIS só aceita pedidos do Worker, que exige sessão |
| Tarifário a partir do PDF da fatura (lido no browser) | "Amanhã no mercado": os preços do dia seguinte são lidos pelo Cron do Worker |
| Potência contratada aproximada (máximos de 15 min, com o aviso) | Potência ao segundo, aparelhos, tensão, falhas de energia |
| Consumo base, dias fora do habitual, fatura prevista, relatório em PDF | Avisos no telemóvel |
| Clima (Open-Meteo, pedido pelo browser como sempre) | |
| IA com a chave do utilizador, guardada só neste browser (`src/ai/settings.ts`, como num servidor sem `AI_KEY_SECRET`) | |
| Sincronização entre aparelhos e cópias automáticas, pelo OneDrive do utilizador (abaixo) | |

## Limites

- Os dados perdem-se se o browser os apagar (limpeza de dados, janela privada, falta de espaço sem armazenamento persistente) ou ao mudar de aparelho: daí a cópia e o aviso no topo.
- Privacidade: o servidor não guarda nada destas casas. As únicas ligações externas novas são a Microsoft (`login.microsoftonline.com`, `graph.microsoft.com` e os anfitriões de descarregamento do OneDrive), a Google (`accounts.google.com`, `www.googleapis.com`, e, pelo Worker, `oauth2.googleapis.com`) e o Dropbox (`www.dropbox.com`, `api.dropboxapi.com`, `content.dropboxapi.com`), só quando o utilizador liga esse serviço (regra 1 do `CLAUDE.md`); o que lá vai está cifrado no browser.
- A renovação da sessão da Microsoft numa app de página única dura 24 h: depois disso pode falhar e é preciso um clique em "Ligar de novo ao OneDrive". Até lá, as alterações ficam neste browser.
