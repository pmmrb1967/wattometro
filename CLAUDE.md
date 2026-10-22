# CLAUDE.md

Instruções para o Claude Code neste repositório. O plano completo está em `planning/plan.md` — lê-o antes de começar qualquer fase.

## O projeto

**Wattómetro**: PWA gratuita para monitorizar e otimizar o consumo elétrico de uma casa portuguesa, a partir de um **Shelly** instalado no quadro elétrico e/ou do CSV de consumos a 15 min exportado do Balcão Digital da **E-Redes**.

O objetivo não são gráficos (o Home Assistant e a app Shelly já os fazem): são **conclusões em euros e ações concretas** — potência contratada certa, tarifário mais barato para o perfil real, custo do consumo fantasma, fatura prevista do mês, aparelhos a degradar, registo de problemas de tensão para reclamar. IA opcional com a chave do próprio utilizador.

**Âmbito atual: uso familiar** (uma casa, poucos utilizadores), no plano gratuito da Cloudflare. A arquitetura tem de permitir, **sem reescrita**, passar para o plano pago e, mais tarde, para grande público (ver "Preparado para crescer").

Projeto irmão: **Faturómetro** (`github.com/pmmrb1967/faturometro`). Mesmo stack, mesmas convenções. Reutilizar código e documentação de lá em vez de reinventar (ver "Reutilizar do Faturómetro").

## Regras invioláveis

1. **Dados só na conta Cloudflare do dono, na UE.** Bases D1 criadas com `--jurisdiction eu`. Sem analytics nem logs remotos com dados de consumo. Ligações externas permitidas: o Worker do projeto, `https://api.anthropic.com` (só por ação ou definição explícita do utilizador) e Open-Meteo (clima, sem dados pessoais).
2. **A app tem de funcionar sem IA.** Qualquer funcionalidade nova precisa de um caminho sem chave de API.
3. **O código calcula, a IA explica.** Nenhum número mostrado ao utilizador vem de um LLM. A IA recebe resultados já calculados (agregados pequenos) e interpreta-os. Nunca enviar séries temporais em bruto à IA.
4. **Unidades inteiras.** Dinheiro em **cêntimos inteiros** (preços unitários em micro-euros inteiros); energia em **Wh inteiros**; potência em **W**. Nunca somar euros ou kWh em vírgula flutuante. Conversões só em `src/lib/money.ts` e `src/lib/units.ts`.
5. **Multi-casa desde o primeiro dia.** Todas as tabelas com dados levam `household_id`; todo o acesso a dados passa pela camada de repositório (`server/src/repo/`). Nenhuma rota escreve SQL diretamente.
6. **Não inventar dados de referência** (ciclos horários ERSE, escalões de potência, IVA, taxas, limites de tensão, formato do CSV E-Redes, API do Shelly). Usar o que está em `docs/` e nas fixtures; se faltar, parar e perguntar. Cada valor regulatório tem fonte e data de consulta em `docs/`.
7. **Nunca commitar dados reais.** O repositório é público. CSVs da E-Redes, faturas e capturas do Shelly reais ficam em `fixtures/private/` (ignorada pelo Git). No repositório só entram fixtures sintéticas.
8. **API de ingestão versionada** (`/v1/...`). Os scripts instalados nos Shelly não podem partir quando o servidor evolui.

## Arquitetura

```
Shelly (script mJS) ──HTTPS POST /v1/ingest (1×/min)──► Worker (TypeScript) ──► D1 (UE)
                                                              ▲   │
CSV E-Redes ──(processado no browser)──POST /v1/import────────┘   │ Cron: agregações em SQL
                                                                  ▼
                                       PWA (Vite + React, Cloudflare Workers Assets)
                                       cálculos de domínio + ML + IA no browser
```

- **Sem PC nem hub em casa.** O Shelly envia diretamente para o Worker através de um script interno.
- O **script do Shelly** lê as medições a ~1 s e envia **um pedido por minuto** com: (a) o agregado do minuto (energia, potência média/mín./máx., tensão mín./méd./máx., fator de potência) e (b) os **60 valores ao segundo** de potência ativa, potência não ativa (√(S² − P²)) e tensão. Também trata **localmente** do alerta/corte de potência (funciona sem internet).
- **O script é "burro" e estável:** só recolhe e envia. Nenhuma deteção de eventos nem NILM no Shelly — essa lógica vive no browser, para poder ser melhorada e reprocessada sobre os dados ao segundo guardados. Única exceção: o alerta/corte de potência.
- O **Worker** é fino: recebe, valida (zod), grava, serve agregados, autentica. Limite de **10 ms de CPU por pedido** no plano gratuito → nada de contas pesadas no Worker.
- **Agregações** (1 min → 15 min → dia) feitas por Cron Trigger com `INSERT … SELECT` em SQL (o trabalho é do D1, não da CPU do Worker), sempre incrementais.
- **Cálculos de domínio** (custos, simulador de tarifários, potência contratada, consumo base, previsões, ML) correm **no browser**, em `src/domain/` e `src/ml/`, sobre agregados pedidos ao Worker e guardados em cache no Dexie.
- **Uma só origem:** o Worker `app` serve a PWA (Workers Assets) e encaminha `/v1/*` para o Worker `api` por *service binding* (`server/src/gateway.ts`). O `api` não tem endereço `workers.dev`; o Shelly envia para `https://app.wattometro.workers.dev/v1/ingest`. O cookie de sessão fica na mesma origem da API (sem CORS).
- **Tempo real = último minuto.** A PWA não consegue ler o Shelly diretamente (HTTPS → HTTP local é bloqueado pelos browsers). O valor ao segundo continua disponível na app oficial do Shelly.

## Stack

- **App:** Vite + React 18 + TypeScript (`strict: true`), `vite-plugin-pwa`, `react-router`, Dexie (cache local), `zod`, gráficos com uPlot ou ECharts (séries longas)
- **IA:** `@anthropic-ai/sdk` com `dangerouslyAllowBrowser: true`, sempre através de `src/ai/`
- **Servidor:** Cloudflare Worker em TypeScript (`server/`), D1, Cron Triggers, `zod`. Router: Hono (leve, portável para Node/Bun/Deno)
- **Shelly:** script mJS em `shelly/` (versionado, com versão no payload)
- **Clima:** Open-Meteo
- **PDF:** gerado no browser
- **Testes:** Vitest (unitários, incluindo servidor com SQLite em memória), Playwright (e2e mínimo)
- **Gestor de pacotes:** pnpm
- **Autenticação:** login próprio em `server/src/auth.ts` (o Zero Trust pede cartão de crédito mesmo no plano Free). Email + password (PBKDF2-SHA256, `server/src/password.ts`); sessão deslizante (renova-se com o uso; termina ao fim de 30 dias sem uso) em cookie `__Host-wm_session` HttpOnly/Secure/SameSite=Strict assinado com HMAC (`SESSION_SECRET`); escritas exigem `Origin` da própria app; 5 falhas → bloqueio de 15 min. **Sem registo público:** as contas criam-se com `pnpm user:create --remote`; a password e o nome da casa mudam-se em Definições (`/definicoes`). `/v1/ingest` autentica-se por **token por dispositivo** (guardado só como hash)

## Estrutura

```
wattometro/
├── CLAUDE.md
├── LICENSE                    # AGPL-3.0
├── planning/plan.md
├── docs/                      # dados de referência com fonte e data (ERSE, IVA, E-Redes, Shelly, tensão)
├── fixtures/                  # sintéticas (commitadas) | private/ (reais, ignoradas)
├── shelly/                    # script mJS + instruções de instalação
├── src/                       # PWA
│   ├── ai/                    # abstração AiProvider, ferramentas, prompts
│   ├── app/                   # páginas e rotas
│   ├── components/
│   ├── data/                  # dados de referência pequenos (ciclos ERSE, escalões, IVA), com fonte em docs/
│   ├── db/                    # Dexie (cache)
│   ├── domain/                # lógica pura: tarifas, custos, potência, consumo base
│   ├── ml/                    # previsão, anomalias, saúde de aparelhos
│   ├── nilm/                  # deteção de eventos sobre readings_1s, agrupamento, rotulagem
│   ├── import/                # parser CSV E-Redes
│   ├── i18n/pt-PT.ts
│   └── lib/                   # money.ts, units.ts, time.ts
├── server/
│   ├── src/
│   │   ├── worker.ts          # entrada: fetch + scheduled
│   │   ├── app.ts             # rotas (Hono)
│   │   ├── repo/              # ÚNICO sítio com SQL
│   │   ├── ingest.ts
│   │   ├── rollups.ts         # agregações do Cron
│   │   ├── auth.ts            # sessões de utilizador; tokens de dispositivo
│   │   ├── password.ts        # PBKDF2 (partilhado com scripts/create-user.ts)
│   │   └── gateway.ts         # Worker `app`: /v1/* → Worker `api`
│   ├── migrations/
│   └── wrangler.toml
├── public/data/               # ficheiros grandes servidos à parte (ofertas ERSE: pnpm erse:sync)
├── scripts/
└── wrangler.app.toml          # a PWA (Workers Assets)
```

## Modelo de dados (resumo)

- `households`, `devices` (token em hash, modelo Shelly, versão do script)
- `readings_1m` — uma linha por dispositivo, canal e minuto: `energy_wh`, `power_avg_w`, `power_min_w`, `power_max_w`, `voltage_min_dv`, `voltage_avg_dv`, `voltage_max_dv` (decivolts inteiros), `pf_avg_pct`. Retenção configurável (por defeito 24 meses).
- `readings_1s` — uma linha por dispositivo, canal e minuto com os valores ao segundo **compactados num BLOB** (inteiros; formato documentado em `docs/readings-1s.md`, com versão). Retenção curta (por defeito **90 dias**). Base da deteção de eventos e do NILM no browser.
- `signatures` — minutos marcados no modo de calibração ("liguei a máquina de lavar"), copiados de `readings_1s` e **sem expiração**.
- `events`, `appliances`, `event_labels` — eventos detetados no browser e rótulos do utilizador (guardados no servidor para sincronizar entre dispositivos).
- `readings_15m` — energia, pico ao segundo e tensão mín./máx. por 15 min e por contador (`meter`: `device_id:channel` ou `eredes`), **alinhados com a E-Redes**; origem `shelly` ou `eredes`. Retenção indefinida.
- `daily` — por contador e dia de Lisboa: energia, potência máxima, tensão mín./máx.; energia por período horário e consumo base na Fase 3.
- `maintenance_state` — progresso do Cron (até onde agregou, última purga, tamanho da base).
- `voltage_events`, `outages` — derivados dos minutos.
- `tariffs` — tarifário da casa (opção horária, ciclo, mapa de períodos, potência em VA, preços sem IVA em **micro-euros inteiros**, taxas da fatura, data de início).

Orçamento de armazenamento no plano gratuito: **500 MB por base D1**. `readings_1m` ≈ 50–80 MB por ano por dispositivo; `readings_1s` ≈ 0,5 MB por dia (361 bytes por minuto), ou seja, ≈ 47 MB com 90 dias de retenção. Os dados ao segundo **não aumentam o número de pedidos nem de linhas escritas** (vão no mesmo pedido e na mesma linha por minuto). Se o tamanho se aproximar do limite, mover `readings_1s` (e depois `readings_1m`) para uma base separada (padrão já usado no Faturómetro com `FILES`).

## Regras de domínio

- **Tempo:** guardar em UTC (epoch em segundos); apresentar em `Europe/Lisbon`. Testes obrigatórios para os dias de 23 h e 25 h.
- **Intervalos de 15 min:** confirmar no CSV real se o timestamp da E-Redes marca o início ou o fim do intervalo; a convenção vive só em `src/lib/time.ts`.
- **Ciclos horários, escalões de potência, IVA e taxas** vivem como dados (`src/data/`, com fonte e data em `docs/`), versionados por data de validade — nunca em `if`s espalhados.
- **Potência contratada:** dados de 15 min escondem picos curtos; usar `power_max_w` dos minutos quando houver Shelly e dizê-lo ao utilizador quando só houver E-Redes.
- **Tensão:** confirmar limites e regulamento aplicáveis antes de implementar (registar em `docs/voltage.md`).

## Reutilizar do Faturómetro

Copiar (e adaptar, mantendo a fonte) em vez de reescrever:
- `docs/electricity-vat.md`, `docs/erse-data.md` e `scripts/erse-sync.ts` (ofertas ERSE → simulador de tarifários com o perfil real)
- `src/domain/electricity-cost.ts`, `src/domain/compare.ts` (custo e comparação de ofertas)
- `src/lib/money.ts`, `src/i18n/` (padrão), `src/ai/` (abstração `AiProvider`, estimativa de custo, prompts versionados)
- `server/`: estrutura `worker.ts`/`app.ts`/`db.ts`, `env.ts` com limites por variáveis, `maintenance.ts` (Cron), testes com SQLite em memória
- Configuração de pnpm, ESLint, Prettier, Vitest, `vite-plugin-pwa`, `security-headers.ts`

## Preparado para crescer

| Etapa | Mudança necessária |
|---|---|
| Família (agora) | Plano gratuito; login próprio, contas criadas por script |
| Amigos / primeiros utilizadores | Workers Paid (mudança de plano); limites por variáveis em `wrangler.toml` |
| Grande público | Registo público, recuperação de password e limites por IP em `auth.ts`; dados por casa (uma base D1 por casa/grupo, ou Durable Objects) atrás de `repo/`; política de privacidade e RGPD |
| Sair da Cloudflare | Hono corre em Node; `repo/` passa a falar com PostgreSQL |

Se uma decisão tornar alguma destas passagens mais difícil, parar e assinalar.

## Comandos

```bash
pnpm dev                 # PWA em desenvolvimento; /v1 vai para pnpm dev:server (ou VITE_API_PROXY)
pnpm dev:server          # API local (wrangler dev, D1 local)
pnpm test                # vitest (app + servidor, SQLite em memória)
pnpm typecheck
pnpm lint
pnpm build
pnpm icons               # gera os ícones da PWA a partir de public/icon.svg
pnpm db:migrate:local    # migrações D1 locais
pnpm db:migrate:remote   # migrações D1 na Cloudflare
pnpm user:create --remote  # cria uma conta ou muda a password (num terminal normal: pede a password)
pnpm deploy:server       # Worker `api` (sem endereço público; publicar antes da app)
pnpm deploy:app          # build + Worker `app` → https://app.wattometro.workers.dev (/v1/* → api)
```

`pnpm erse:sync` atualiza `public/data/erse-offers.json` com as ofertas da ERSE. Os `wrangler*.toml` fixam o `account_id` da conta Wattómetro: o login do wrangler nesta máquina vê várias contas.

Antes de dar uma tarefa por concluída: `pnpm typecheck && pnpm lint && pnpm test` sem erros.

## Convenções

- **Código, nomes e comentários em inglês. Texto visível ao utilizador em português europeu** (pós-AO90, tratamento por "tu"), centralizado em `src/i18n/pt-PT.ts`.
- Sem `any`. Tudo o que vem de fora (Shelly, CSV, IA, ERSE, Open-Meteo) é validado com zod.
- Lógica de domínio em `src/domain/` sem dependências de React, testável, com casos calculados à mão.
- Migrações D1: ficheiro novo + teste; nunca alterar uma migração já aplicada. Alterações ao esquema Dexie: nova versão + migração.
- Cabeçalho SPDX em cada ficheiro de código: `// SPDX-License-Identifier: AGPL-3.0-or-later`.
- Commits pequenos (Conventional Commits).

## IA

- Sempre por `src/ai/` (abstração `AiProvider`). Nada de chamadas diretas ao SDK espalhadas pela app.
- Tool use com ferramentas executadas **no browser** sobre dados já calculados: `get_consumption_summary`, `get_cost_breakdown`, `simulate_tariffs`, `recommend_contracted_power`, `get_baseload`, `get_anomalies`, `forecast_month_bill`, `get_voltage_events`.
- Saída estruturada validada com zod; uma nova tentativa no máximo.
- Mostrar o custo estimado antes de enviar (salvo se o utilizador ativou o envio automático).
- Prompts em `src/ai/prompts/`, versionados, em pt-PT.

## Licença

AGPL-3.0-or-later, © 2026 Paulo (pmmrb1967). Rodapé da app com link para o código-fonte. Contribuições externas só com acordo de contribuidor (CLA), para manter a possibilidade de outra licença no futuro. O nome "Wattómetro" não é coberto pela licença.

## Forma de trabalhar

- Seguir as fases de `planning/plan.md` por ordem; marcar as caixas concluídas e registar decisões na secção "Decisões".
- Antes de uma tarefa grande, propor um plano curto e esperar confirmação.
- Se uma tarefa exigir um dado que não existe no repositório (CSV real, resposta do Shelly, valor regulatório), perguntar em vez de assumir.
