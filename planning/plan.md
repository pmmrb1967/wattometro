# Wattómetro — Plano

> Documento vivo. Marcar `[x]` ao concluir; registar decisões e desvios na secção "Decisões".
> Regras, stack e convenções: `../CLAUDE.md`.

## 1. Visão

Uma PWA que transforma o consumo elétrico de uma casa portuguesa em **poupança concreta**: potência contratada certa, tarifário mais barato para o perfil real, consumo fantasma visível, fatura prevista, aparelhos a degradar detetados cedo e problemas de tensão registados com prova — com explicações opcionais por IA.

- **Fonte principal:** Shelly no quadro elétrico, a enviar diretamente para a cloud (sem PC em casa).
- **Fonte complementar:** CSV de 15 min da E-Redes (histórico anterior ao Shelly; casas sem Shelly no futuro).
- **Âmbito atual:** uso familiar, plano gratuito da Cloudflare.
- **Futuro possível:** plano pago e grande público, sem reescrita.

## 2. Diferenciação

| Existente | Limitação | Wattómetro |
|---|---|---|
| App Shelly / Home Assistant | Gráficos, sem conhecimento de tarifas portuguesas | Conclusões em euros com regras ERSE |
| Simulador ERSE | Usa perfis médios | Usa o consumo real a 15 min/1 min |
| Ninguém (consumidor) | — | Otimização da potência contratada; registo de tensão para reclamar |

## 3. Visão geral das fases

| Fase | Nome | Resultado |
|---|---|---|
| 0 | Fundações | Repositório, PWA e Worker publicados, D1 na UE, login próprio |
| 1 | Ingestão Shelly | Script no Shelly, dados por minuto e ao segundo na D1, agregações, "agora" na app |
| 2 | Importação E-Redes | Histórico a 15 min importado e reconciliado com o Shelly |
| 3 | Poupança PT | Custos, simulador de tarifários (ofertas ERSE), potência contratada, consumo base, PDF mensal |
| 4 | Alertas | Alerta/corte de potência local no Shelly; notificações push |
| 5 | Qualidade de energia | Eventos de tensão e falhas, relatório para reclamação |
| 6 | ML no browser | Previsão da fatura, anomalias, saúde de aparelhos |
| 7 | IA | Perguntas em linguagem natural, relatório narrado, alertas explicados |
| 8 | NILM | Deteção ao segundo no browser, calibração, rotulagem, custo por aparelho |
| 9 | Crescimento | Plano pago, público, extensões |
| 10 | Design e usabilidade | Conclusões no topo de cada página, legível no telemóvel, contraste AA |
| 11 | Mercado | O que falta face às apps semelhantes (revisão de 27/10/2026) |

**Primeiro marco útil:** fases 0 a 3.

---

## Fase 0 — Fundações

- [x] Criar repositório público `wattometro` com `LICENSE` (AGPL-3.0) e `README.md`
- [x] Copiar do Faturómetro a configuração base: pnpm, TypeScript strict, ESLint, Prettier, Vitest, `vite-plugin-pwa`, `security-headers.ts`
- [x] PWA mínima (Vite + React) com `src/i18n/pt-PT.ts` e rodapé com link para o código-fonte
- [x] `wrangler.app.toml` (Workers Assets, SPA) e `pnpm deploy:app`
- [x] `server/` com Hono: `worker.ts`, `app.ts`, `env.ts`, `GET /v1/health`
- [x] D1 `wattometro` criada com `--jurisdiction eu`; migração inicial (`households`, `devices`)
- [x] Camada `server/src/repo/` com testes em SQLite em memória
- [x] ~~Cloudflare Access~~ → login próprio (o Zero Trust Free pede cartão): migração `0002_users`, `server/src/auth.ts`, `scripts/create-user.ts`, ecrã de entrada
- [x] `src/lib/money.ts`, `units.ts`, `time.ts` com testes (incluindo dias de 23 h e 25 h)
- [x] `.gitignore` com `fixtures/private/`, `.dev.vars`, `dist/`
- [x] Confirmar comandos reais e atualizar `CLAUDE.md`

**Aceitação:** app e Worker publicados; `/v1/health` responde; só a família entra (login próprio); `pnpm typecheck && pnpm lint && pnpm test` passam.

---

## Fase 1 — Ingestão Shelly

### 1.1 Preparação
- [x] **Confirmar modelo do Shelly** e firmware; registar em `docs/shelly.md` — EM Gen3 (`S3EM-002CXCEU`), firmware 2.1.0, a funcionar desde 2026-10-24
- [x] Capturar respostas reais de `EM1.GetStatus` e `EM1Data` → `fixtures/private/shelly/`; equivalentes sintéticas em `fixtures/shelly/`
- [x] Confirmar suporte de scripts, `Timer`, `HTTP.POST` com HTTPS e limites de memória do script (~25 KB por script; um envio precisa de ~3,3 KB + 4 × o corpo — `docs/shelly.md`)
- [x] Confirmar **como o script obtém medições a cada segundo** e **que grandezas existem ao segundo** — `Timer` a 1 s com `Shelly.getComponentStatus('em1')`; o valor muda 1×/s (☑); potência ativa, aparente e FP, reativa derivada (☑); cada valor é a média de ~1 s, não instantâneo (☑ teste da chaleira, 2026-10-25, `docs/shelly.md`)
- [x] Medir o tamanho real do pedido por minuto (agregado + arrays) e confirmar que o Shelly o envia sem problemas — ~1 KB por minuto com os valores ao segundo, ~100 bytes só com o resumo

### 1.2 Servidor
- [x] Migração `readings_1m` (ver `CLAUDE.md`), com chave `(device_id, channel, ts)` — `0003_readings.sql`
- [x] Migração `readings_1s` (uma linha por minuto, valores ao segundo num BLOB); formato binário versionado e documentado em `docs/readings-1s.md` (P, Q não ativa e V em int16 little-endian, segundos em falta marcados)
- [x] Funções de codificação/descodificação partilhadas entre servidor e browser, com testes de ida e volta (`src/lib/readings-1s.ts`)
- [x] Registo de dispositivo: gera token, guarda só o hash, mostra o token uma vez (Definições → Dispositivos)
- [x] `POST /v1/ingest`: autenticação por token, validação zod, payload com versão do script, idempotente (reenvio do mesmo minuto não duplica), aceita lotes (minutos em atraso); grava o agregado em `readings_1m` e os arrays em `readings_1s` na mesma operação
- [x] Limites por dispositivo (tamanho do payload, pedidos por minuto)
- [x] Testes: duplicados, minutos fora de ordem, payload inválido, token errado

### 1.3 Script no Shelly (`shelly/wattometro.js`)
- [x] Ler medições a ~1 s; agregar por minuto: energia (Wh), potência méd./mín./máx., tensão mín./méd./máx., FP médio
- [x] Juntar ao pedido os 60 valores ao segundo (potência ativa, potência não ativa e tensão), como inteiros
- [x] **Sem lógica de deteção no script** (só recolhe e envia), exceto o alerta/corte de potência da Fase 4
- [x] Enviar 1×/min; em falha, guardar os minutos em fila (limitada pela memória; se faltar memória, descartar primeiro os arrays ao segundo e manter os agregados) e reenviar em lote
- [x] Configuração por `KVS` do Shelly (URL, token, canal; limiares na Fase 4) — nada fixo no código
- [x] `shelly/README.md` com instalação passo a passo
- [x] Teste do script num Shelly simulado contra o servidor real (`shelly/wattometro.test.ts`), com o modelo de memória medido no aparelho (cortes de 20 min e de 3 h, quebra momentânea de memória)
- [x] Correr o script num Shelly real — desde 2026-10-24 (script 0.3.0; `pnpm shelly:install`, com agendamento que volta a arrancar o script se parar)

### 1.4 Agregações (Cron)
- [x] Migrações `readings_15m`, `daily` (`0004_rollups.sql`; por contador `meter`; períodos horários e consumo base no `daily` ficam para a Fase 3)
- [x] `rollups.ts`: `INSERT … SELECT` incremental 1 min → 15 min → dia; marca de "último processado" (Cron a cada 5 min; recalcula as últimas 6 h para os minutos atrasados)
- [x] Purga de `readings_1m` e `readings_1s` conforme retenção (por defeito 24 meses e 90 dias); nunca purgar minutos referenciados em `signatures` (as assinaturas da Fase 8 são cópias, por isso a purga não lhes toca)
- [x] Monitorização do tamanho da base (alerta na app a partir de 80 % dos 500 MB)

### 1.5 App
- [x] Página "Agora": último minuto (potência, tensão), energia de hoje, pico de hoje, estado do Shelly (último envio)
- [x] Custo provisório de hoje (tarifário em Definições; motor de custos da Fase 3.2)
- [x] Gráficos dia/semana/mês e mapa de calor hora × dia da semana (página `/consumo`, `src/domain/consumption.ts`)

**Aceitação:** 7 dias de dados sem perdas relevantes; um corte de internet de 30 min é recuperado sem buracos.

---

## Fase 2 — Importação E-Redes

- [x] **Obter um ficheiro real** do Balcão Digital → `fixtures/private/` (é `.xlsx`, não CSV); formato em `docs/eredes-csv.md`; fixture sintética (`src/import/eredes-fixture.ts`)
- [x] Parser no browser (`src/import/eredes.ts`): `.xlsx` com `fflate`, kW por quarto de hora → Wh, vírgula decimal, estado real/estimado
- [x] Convenção início/fim do intervalo confirmada (a hora marca o **fim**) e aplicada em `src/lib/time.ts` (`eredesQuarterStart`)
- [x] `POST /v1/import/eredes` (lotes de 15 min, idempotente, origem `eredes`, marca de estimado; migração 0009) e secção em Definições
- [x] Reconciliação Shelly vs E-Redes nos períodos sobrepostos (diferença em %; mostrar ao utilizador) — `src/domain/reconciliation.ts`, cartão no Consumo com a casa escolhida: só dias completos dos dois (o Shelly com todos os minutos do dia de Lisboa), diferença global e dias fora do habitual
- [x] Regra de prioridade por período (por defeito: E-Redes é a referência de faturação; Shelly para detalhe) — série "Casa" (`houseQuarters`): E-Redes até ao último dia importado, Shelly a partir daí; nunca se somam

**Aceitação:** um ano importado; totais mensais coerentes com as faturas; diferença Shelly/E-Redes documentada.

---

## Fase 3 — Poupança PT

### 3.1 Dados de referência
- [x] Copiar e adaptar do Faturómetro: `docs/electricity-vat.md`, `docs/erse-data.md`, `scripts/erse-sync.ts` (só eletricidade; `pnpm erse:sync` → `public/data/erse-offers.json`)
- [x] `docs/time-cycles.md` + `src/data/time-cycles.json`: ciclos simples, bi-horário e tri-horário (diário e semanal), verão/inverno — **com fonte ERSE e data** (mapa vigente e o novo da Diretiva 3/2026)
- [x] Escalões de potência em vigor — **com fonte e data** (`docs/contracted-power.md`, `src/data/power-tiers.json`)

### 3.2 Motor de custos (`src/domain/`)
- [x] Reaproveitar `electricity-cost.ts` do Faturómetro; adaptar a consumo por intervalo
- [x] `classifyPeriod(ts, cycle)` com testes de fronteiras, fins de semana e mudança de hora (`meterPeriod`/`billingPeriod` em `src/domain/time-cycles.ts`)
- [x] Custo por período: energia, potência, taxas, IVA (incluindo limiar proporcional aos dias), em cêntimos
- [x] Tarifário da casa (migração `0005_tariffs.sql`, `/v1/tariffs`, secção em Definições), com histórico por data de início
- [x] Validação contra 3 faturas reais Repsol (maio–agosto de 2026, em `fixtures/private/`): com a energia faturada, o total bate a ±1 cêntimo (margem do teste: 2 cêntimos); com a energia do ficheiro da E-Redes, a menos de 1 % (testes `*.real`, só locais). IVA do IEC: 23 %, pela ERSE
- [x] Descontos do comercializador na energia, tarifa social e o seu financiamento no tarifário da casa (migração 0008)

### 3.3 Simulador de tarifários
- [x] Aplicar o consumo real de 12 meses a **todas as ofertas ERSE** (`erse-offers.json`) e opções horárias (`src/domain/compare.ts`, página `/tarifarios`)
- [x] Ranking anual com poupança face ao atual
- [x] "Quanto teria de deslocar para o vazio para o bi-horário compensar"

### 3.4 Potência contratada
- [x] Potência máxima por 15 min e por minuto (`power_max_w`; aparente `apparent_max_va` a partir dos valores ao segundo)
- [x] Recomendação do escalão mínimo com margem configurável (curva de corte do contador inteligente, `docs/contracted-power.md`); poupança anual
- [x] Lista dos momentos mais próximos do limite; aviso quando só há dados E-Redes

### 3.5 Consumo base
- [x] Percentil baixo noturno robusto; custo anual; evolução mensal (`src/domain/baseload.ts`, página `/consumo`)

### 3.6 Relatório mensal PDF
- [x] Gerado no browser: consumo, custo, comparação com mês anterior e homólogo, consumo base, potência máxima, sugestões determinísticas (`src/domain/monthly-report.ts`, página `/consumo/relatorio`, impressão do browser)

**Aceitação:** a app indica o tarifário e a potência mais baratos e quanto se poupa; o custo calculado bate com as faturas dentro da margem definida.

---

## Fase 4 — Alertas

- [x] Registo na app das vezes em que se esteve perto do corte (página Potência, "Perto do corte": episódios acima de 1,2 × a potência contratada que chegaram a metade do tempo de corte, a partir dos valores ao segundo; `nearTripEpisodes` em `src/domain/contracted-power.ts`)
- [ ] Script do Shelly: alerta local quando a potência se aproxima da contratada (limiar em `KVS`) — adiado: por agora o utilizador preferiu só o registo na app
- [ ] Corte local de carga adiável (saída do Shelly ou outro Shelly de relé na rede) — desligado por defeito, com confirmação nas definições
- [x] Web Push a partir do Worker (chave VAPID privada como secret) para: potência perto do corte, Shelly sem enviar há 15 minutos, base de dados perto do limite diário (`server/src/alerts.ts`, `docs/alerts.md`)
- [x] Web Push para anomalias: "Ontem, fora do habitual", uma vez por dia a partir das 10:00, com o mesmo teste da app (`judgeDay`) sobre os totais diários; só nas casas em que a temperatura não conta (migração 0023, `docs/alerts.md`)
- [x] Supressão de alertas repetidos (`alert_state`: uma vez por condição; potência no máximo uma por hora)

**Aceitação:** teste com carga real dispara alerta (e corte, se ativo) mesmo sem internet.

---

## Fase 5 — Qualidade de energia

- [x] **Confirmar limites de tensão e regulamento aplicáveis** → `docs/voltage.md`
- [x] Eventos de sobretensão/subtensão a partir de `voltage_min/max` por minuto (duração mínima configurável); conformidade semanal NP EN 50160 com valores de 10 min (`voltage_10m`)
- [x] Falhas de energia: buracos nos minutos + tempo de arranque (uptime) do Shelly (script 0.2.0, tabela `outages`); comparação com o padrão individual da zona A/B/C
- [x] Histórico na app (`/qualidade`) e PDF factual para anexar a reclamação (sem afirmações legais) — impressão do browser

**Aceitação:** eventos sintéticos detetados com início, fim, duração e extremos.

---

## Fase 6 — ML no browser

- [x] Open-Meteo: histórico e previsão para a localização da casa; cache no browser (IndexedDB, `src/weather/`); localidade em Definições (migração 0010, `docs/open-meteo.md`)
- [x] Previsão da fatura do mês: regressão com consumo até à data, dia da semana, feriados (`docs/holidays.md`), temperatura; baseline ingénua para comparação; backtest (`src/ml/bill-forecast.ts`, `pnpm ml:backtest`; cartão em Agora, detalhe em Consumo) — no ficheiro real, com a temperatura de Lavra (localidade da casa): sem temperatura 4,15 %, com temperatura 4,29 %, baseline 4,16 % (52 previsões); a app escolhe por casa o método que menos errou
- [x] Perfil da instalação em Definições (aquecimento — várias escolhas —, ar condicionado, água quente, placa, painéis solares, carro elétrico; migração 0011, `src/domain/installation.ts`)
- [x] Anomalias: perfil esperado hora × dia da semana × temperatura; desvio com limiar estatístico — `src/ml/anomalies.ts`: cada dia contra os 12 mais recentes do mesmo tipo (útil / sábado / domingo e feriado; só os de temperatura parecida, ±3 °C, quando a instalação segue o tempo), z robusto (mediana e MAD, limiar 3,5, Iglewicz & Hoaglin) com dispersão mínima de 5 %; horas que explicam o desvio e o seu custo. Testes com anomalias plantadas (uma noite +1,5 kW, um dia fora de casa). No ficheiro real (`pnpm ml:anomalies`, sem temperatura): 19 de 364 dias, 11 acima e 8 abaixo do habitual. Cartão "Ontem, fora do habitual" em Agora e lista dos últimos 90 dias em Consumo
- [ ] Saúde de aparelhos (com Fase 8): duty cycle do frigorífico vs temperatura exterior; duração dos ciclos do termoacumulador

**Aceitação:** previsão melhor que a baseline no backtest; anomalias plantadas são detetadas.

---

## Fase 7 — IA (opcional)

- [x] Copiar do Faturómetro a abstração `src/ai/` (provider, estimativa de custo, sessão) — chave, modelo e "envio automático" só no browser (localStorage, por conta), em Definições → Inteligência artificial; testada antes de guardar; gasto do mês estimado. Sonnet 5.5 por defeito (o chat encadeia ferramentas), Haiku e Opus à escolha; em Sonnet e Opus, *fallback* do lado do servidor (`fallbacks: "default"`) se um pedido for recusado
- [x] Ferramentas executadas no browser (ver `CLAUDE.md`), com contratos zod e respostas pequenas — `src/ai/tools/`: as oito, cada uma com as mesmas funções e predefinições da sua página (Consumo, Relatório, Tarifários, Potência, Qualidade, Agora), valores já formatados como a app os mostra; testes comparam cada ferramenta com a página. Potência e tensão pedem os seus dados ao Worker só quando a IA as chama (`src/app/ai-context.ts`)
- [x] Chat "Pergunta ao Wattómetro" — num painel aberto por um botão no canto inferior direito de cada página (ver Decisões, 2026-10-25; `/perguntar` abre-o): custo estimado antes de enviar (salvo envio automático), conversa com seguimento, ferramentas usadas e os seus resultados à vista; cada valor com unidade (€, kWh, W, kVA, V, %) da resposta é procurado nos resultados das ferramentas e os que não estiverem são assinalados como não confirmados pela app (`src/ai/verify.ts`). Esforço `medium`, prompt e ferramentas em cache, no máximo 6 voltas de ferramentas
- [x] Relatório mensal narrado sobre números já calculados — botão "Explicar com IA" no Relatório: envia os mesmos factos que a ferramenta `get_cost_breakdown`; resposta em JSON (`output_config.format`, esquema sem limites de tamanho, que a API não aceita; o zod verifica-os), uma nova tentativa no máximo, valores não confirmados assinalados
- [x] Alertas explicados em linguagem simples — o mesmo botão em cada dia fora do habitual (Início e Consumo), com os factos de `get_anomalies`; as causas são apresentadas como hipóteses
- [x] `pnpm ai:eval`: perguntas com respostas esperadas; os números têm de bater com o motor de cálculo — 6 perguntas sobre o export real (fixtures/private): ferramenta certa, números principais citados, nenhum valor fora das ferramentas. 2026-10-25, claude-sonnet-5-5: 6/6, ≈ 0,08 US$ (`--dry` corre as ferramentas sem a API)

**Aceitação:** "quanto gastei em setembro?" e "compensa-me o bi-horário?" respondidos com números idênticos aos da app.

---

## Fase 8 — NILM (no browser, sobre os dados ao segundo)

Toda a lógica corre em `src/nilm/`, sobre `readings_1s`. Pode ser melhorada e reprocessada sobre os últimos 90 dias sem tocar no Shelly.

### 8.1 Deteção de eventos
- [x] Deteção de saltos de potência (ΔP, e ΔQ quando houver) com filtragem de ruído e estados estáveis antes/depois — `src/nilm/events.ts`: estados estáveis de ≥ 3 s (cada segundo a max(15 W, 2 %) da média), evento se |ΔP| ≥ 30 W; os estados encontram-se na potência medida e só o salto é escalado a 230 V (`deltaW230`), para uma descida de tensão não parecer um aparelho. Dados por `GET /v1/seconds` (um dia, pela chave primária), em cache no browser para dias fechados (`src/app/seconds-cache.ts`)
- [x] Descritor de cada evento ao segundo: ΔP, ΔQ/ΔFP, pico de arranque (overshoot) e duração do transitório, rampa (aparelhos com inversor), estabilidade do estado seguinte
- [x] Emparelhamento liga/desliga → ciclos com duração e energia (`src/nilm/cycles.ts`; cada descida com a subida aberta mais recente que espelha, até 6 h) e cartão "Ao segundo" em Consumo, com os ciclos agrupados por potência (`src/nilm/summary.ts`). Na casa da demonstração encontra todos os ciclos do frigorífico, o termoacumulador, a chaleira e a máquina da loiça
- [x] Aparelhos multi-estado (ex.: fases da máquina de lavar) — uma descida que não espelha nenhum aparelho aberto, mas é ≥ 30 % da potência de um deles e deixa ≥ 30 W ligados, é uma mudança de fase desse aparelho; o ciclo guarda as fases e a energia soma-as. No agrupamento, só se juntam ciclos com as mesmas fases. Na demonstração: a máquina de lavar de sábado (2000 W → 400 W, 80 min) num só ciclo
- [x] `pnpm nilm:eval` sobre dias reais em `fixtures/private`, com os aparelhos anotados pelo utilizador — `fetch <dia>` descarrega, `notes.json` com os aparelhos anotados. A 29/10, sobre 26–29/10: 10 de 11 anotações encontradas (falta a máquina de secar interrompida de 27/10); a lavagem de 29/10 levou a duas correções (ver Decisões, 2026-10-29)
- [x] Padrões periódicos de segundos (ex.: placa de indução a pulsar) — `src/nilm/periodic.ts`: ≥ 3 ciclos da mesma potência, cada um ≤ 5 min e a começar ≤ 2 min depois do anterior acabar, passam a um só uso "aos pulsos" (energia = soma dos pulsos); os outros ciclos entretanto (frigorífico) ficam à parte. Pulsos de menos de 3 s não deixam estado estável e não são vistos: a confirmar com uma placa real
- [ ] Migração `events` (resultado sincronizado) e reprocessamento idempotente por intervalo de datas

### 8.2 Modo de calibração
- [x] Ecrã "Calibrar": o utilizador indica o aparelho, liga-o e desliga-o com a app aberta — `/consumo/calibrar` (link no cartão "Ao segundo"): "Liguei agora" / "Desliguei agora" (guardado no browser se a app fechar; envia quando o Shelly já mandou os minutos: 75 s depois, e cada minuto até 15 min) ou as horas à mão (últimos 90 dias); até 4 h
- [x] Os minutos correspondentes são copiados para `signatures` (sem expiração) com o rótulo — migração 0013 (`signatures` + `signature_seconds`, um minuto a mais de cada lado), `POST/GET/DELETE /v1/signatures`; cada assinatura mostra o ciclo que a deteção encontra nela (`src/nilm/signature.ts`)
- [x] Biblioteca de assinaturas da casa, usada para classificar eventos futuros e passados — cada calibração com ciclo tem "Reconhecer nos outros dias", que guarda o descritor do ciclo como aparelho (8.3)

### 8.3 Agrupamento e rotulagem
- [x] Agrupamento por descritor — os ciclos de cada dia agrupam-se pela potência a 230 V e pela forma (fases, pulsos) (`src/nilm/summary.ts`); transitório, duração e hora do dia ainda não entram
- [x] Rotulagem: "O que é?" em cada grupo do cartão "Ao segundo"; o nome guarda o descritor do grupo (potência a 230 V, potência de cada fase, pulsos) como aparelho (`appliances`, migração 0016, `/v1/appliances`) e aplica-se a todos os dias
- [x] Classificação contra os aparelhos com nome (`src/nilm/appliances.ts`, `classify`): mesma forma e potência a 25 W ou 5 % (um televisor de 150 W não é um frigorífico de 110 W); com dois candidatos, ganha o mais próximo. Nomes mudam-se e esquecem-se em "Calibrar aparelhos"
- [x] Duração no descritor (migração 0017): cada aparelho aceita de metade da duração mais curta ao dobro da mais longa que viu; dar o mesmo nome a outro programa (mesma forma e potência) alarga o intervalo em vez de criar outro aparelho; um programa de outra forma fica como segundo descritor com o mesmo nome e a energia soma-se por nome. Assim a chaleira (3 min) não é a máquina de lavar a aquecer (11 min), ambas a ~2 kW
- [x] Fogão com vários discos (calibrado a 26/10: discos de ~1,22 kW, a escala de 1 a 9 só muda a fração do tempo ligado): pulsos da mesma potência que se sobrepõem e o aquecimento contínuo de um disco no máximo juntam-se num só uso; a energia de um uso aos pulsos limita-se à que a casa gastou acima do nível de antes (degraus a menos de 3 s perdidos faziam contar o disco ligado nas pausas: +19 %). Na sessão real, 14 pedaços passaram a um uso de 55 min com 0,649 kWh, para 0,642 kWh gastos
- [x] Corrigir um nome: tocar no nome de um grupo abre "Não é «X»? Que aparelho é este?"; o nome novo fica com a descrição desse grupo (sem alargar a outro) e, em caso de empate, ganha o último nome dado. Se os dois forem quase iguais (mesma forma e potência, durações que se sobrepõem), a app avisa que pode trocá-los: a 26/10, o aquecimento da máquina da loiça (2,03 kW, 12 min) foi tomado pela máquina de lavar (1,96 kW, 11 min)
- [x] Energia dos ciclos limitada ao que a casa gastou: cada ciclo (não aos pulsos) conta, segundo a segundo, no máximo a sua potência acima do nível de antes; ciclos de um grupo ou aparelho que se sobrepõem contam cada segundo uma vez. A 26/10, o grupo de 33 W (128 ciclos, degraus perto do limite do detetor) passou de 2,35 para 0,56 kWh; grupos abaixo de 60 W levam "pouco fiável"
- [ ] Transitório e ΔQ no descritor, se aparelhos reais de potência e duração parecidas se confundirem
- [x] Programas inteiros (`src/nilm/programmes.ts`, migração 0018 `appliances.heats`): aquecimentos de ≥1,5 kW e ≥2 min da mesma potência a ≤15 min uns dos outros são um programa, que continua enquanto a máquina trabalha (minutos com variação ≥150 W ou ≥300 W acima do nível de antes, pausas ≤10 min, nunca para lá de outro aquecimento); um aquecimento sozinho só é programa se durar ≥5 min e tiver ≥5 min de motor depois (a chaleira e um termoacumulador ficam como estão). A energia é a que a casa gastou acima do seu nível. O número de aquecimentos separa as máquinas: a 26/10, máquina de lavar 13:29–14:57, 1 aquecimento, 0,57 kWh (antes só os 0,36 kWh do aquecimento); máquina da loiça 19:52–20:44, 4 aquecimentos, 1,24 kWh. Limites: o que mais estiver ligado durante o programa (frigorífico) conta nele; o enchimento antes do 1.º aquecimento não entra; a máquina de secar (sem aquecimentos de água separados) ainda não foi vista
- [ ] Frigorífico real (visto na madrugada de 26/10): só +25 a +40 W acima do fundo (~95 W), a ligar e desligar em rampa (compressor de velocidade variável?), perto do limite do detetor. **Assinatura confirmada nas madrugadas de 26 a 29/10:** desligado 15–25 min, sempre; ligado de 70 min a 3 h (varia de noite para noite), +25 a +40 W. O que o distingue é a pausa regular, não o tempo ligado. Falta: reconhecê-lo por essa pausa e descontá-lo nos programas (~2–6 % da energia deles)
- [ ] Dois programas da mesma máquina com outro número de aquecimentos (lavagem eco) ficam como descritores separados com o mesmo nome; confirmar com mais lavagens reais. As lavagens de 26, 27 e 29/10 tiveram todas 1 aquecimento (1,91–1,96 kW); ainda nenhuma eco. Os aparelhos com nome antes da migração 0018 (Máquina de lavar, Máquina da loiça) só têm o aquecimento: os programas inteiros aparecem sem nome até o utilizador lhes dar o mesmo nome em "O que é?"
- [x] Dois aparelhos a desligar no mesmo segundo (ex.: frigorífico e máquina da loiça) — o par já se fechava (`closePair`, 28/10), mas só quando nenhum aparelho sozinho espelhava o degrau; com a tolerância da potência não ativa alargada (29/10), a máquina da loiça sozinha passou a espelhar e o frigorífico ficava aberto. Agora ganha o melhor encaixe (ver Decisões, 2026-10-29). Na demonstração, 22–28/10 sem degraus soltos fora da meia-noite, exceto 24/10 às 18:34: o frigorífico liga numa descida de tensão simulada e, escalado a 230 V, o degrau deixa de espelhar (as cargas da demonstração não mudam com a tensão)

### 8.4 Resultados
- [x] Energia por aparelho com nome e percentagem da energia do dia explicada (métrica honesta), no cartão "Ao segundo" (`applianceTotals`)
- [x] Custo por aparelho (`src/domain/appliance-cost.ts`): a energia de cada aparelho espalhada pelos quartos de hora dos seus usos; custo = fatura do dia (energia, IEC, IVA, com o tarifário em vigor nesse dia) menos a fatura do dia sem o aparelho, como no consumo de fundo e nos dias fora do habitual. Em "Aparelhos reconhecidos neste dia"; sem tarifário, uma ligação para o indicar
- [x] "Quanto custam os aparelhos" em Consumo (`src/nilm/recent.ts`, `src/app/recent-appliances.ts`): os aparelhos com nome nos últimos 7 dias inteiros (só os dias com ≥90 % dos minutos), com usos, energia, custo e um mês igual a esses dias (× 365 / 12 / dias). A análise de um dia (`src/nilm/day.ts`) é a mesma de "Ao segundo"; ~80 ms por dia. Ferramenta da IA `get_appliances` com os mesmos números
- [x] Mudar as máquinas de hora: para os programas inteiros (`heats`), o que um mês custaria a menos com elas sempre no período mais barato do tarifário (`shiftSavingCents`, coluna "No vazio" com bi- ou tri-horário); com o simples, em Tarifários, quanto custaria a melhor bi- e tri-horária com essas máquinas no vazio (`costWithMoved`, energia por período de cada ciclo × 365 / dias). Também em `get_appliances`
- [ ] Ciclos por aparelho para a saúde de aparelhos (Fase 6): duty cycle do frigorífico, duração do aquecimento do termoacumulador
- [x] Deteção dos programas reais de 27/10 (`src/nilm/cycles.ts`, `src/nilm/programmes.ts`): aquecimento da máquina de lavar em pedaços (juntos, contam como um), tambor a rodar devagar no fim do programa, máquina de secar com bomba de calor (o compressor desliga com mais potência do que ligou, subindo aos degraus pequenos), desligar em dois degraus seguidos, motor e compressor a desligar no mesmo segundo. Com as notas de 26 e 27/10 (`pnpm nilm:eval`): lavagem, loiça, fogão, lavagem com centrifugação e secagem encontradas inteiras
- [x] Tipo de carga em cada aparelho (`src/nilm/load-kind.ts`): "tipo resistência" (potência não ativa ≤ 10 % da ativa, ≥ 500 W) ou "tipo motor" (≥ 15 %, ≥ 30 var), com dois terços dos ciclos do grupo de acordo; nada nos programas inteiros, nos aparelhos com fases e entre os dois limites. Limiares medidos na casa real a 26 e 27/10
- [x] Potência: o maior pico num segundo em kVA (o que o contador compara com a potência contratada) e o ativo em kW, com a explicação num ⓘ

**Limite assumido:** com ~1 amostra por segundo não há transitórios ao milissegundo nem harmónicos; isso exigiria outro hardware e fica fora do âmbito.

**Aceitação:** termoacumulador, forno/placa, máquina de lavar e frigorífico identificados de forma consistente; um algoritmo melhorado consegue reprocessar os últimos 90 dias.

---

## Fase 9 — Crescimento e extensões

### Plano pago / primeiros utilizadores
- [ ] Passar a Workers Paid; rever limites em `wrangler.toml`
- [ ] Registo de casas e convites; limites de capacidade (padrão do Faturómetro: `MAX_ACCOUNTS`, admissão)

### Grande público
- [ ] Registo público, recuperação de password e limites por IP em `auth.ts` (o login próprio já existe)
- [ ] Dados por casa atrás de `repo/` (uma base D1 por casa/grupo, ou Durable Objects)
- [ ] Política de privacidade, exportação e eliminação de dados (RGPD)
- [ ] Registo da marca "Wattómetro" (INPI/EUIPO) e domínio

### Extensões
- [ ] Solar e bateria: "vale a pena?" com o perfil real
- [ ] Tarifas indexadas (OMIE) e intensidade carbónica: indicação "hora verde e barata"
- [ ] Ligação ao Faturómetro: reconciliar faturas com o consumo medido
- [ ] Ponte Cuidote: rotinas a partir do consumo (consentimento explícito)

## Fase 10 — Design e usabilidade

Revisão de 27/10/2026 (todas as páginas a 390×844 e 1280×800, claro e escuro). O que está bem: um só cartão, paleta sóbria, modo escuro, sem scroll horizontal da página. O problema: as conclusões em euros ficam por baixo de campos, leituras ao vivo e listas de notas.

### 10.1 Rápidas
- [x] Início: trocar "O que vem aí" (desatualizado) por blocos de ação com o valor em euros e ligação à página (potência, tarifário, consumo base); fatura prevista antes da leitura ao vivo
- [x] Contraste: rebordo dos campos ≥3:1 (hoje 1,3:1) e fundo dos campos igual ao do cartão; texto de destaque sobre fundo de destaque ≥4,5:1 (hoje 4,0:1); claro e escuro
- [x] Avisos do topo (servidor e demonstração) numa só faixa; o botão "Perguntar à IA" não tapa conteúdo no telemóvel; estado do servidor com texto, não só cor
- [x] Texto dos gráficos ≥11 px no ecrã (hoje ~8,5 px); a frase "O Shelly mede X %" com o tamanho normal
- [x] Botões desativados sem cursor de "a trabalhar"; ícone visível no modo escuro; `theme-color` para o modo escuro

### 10.2 Estrutura das páginas
- [x] Cada página de análise (Potência, Tarifários, Qualidade, Relatório) abre com uma frase de conclusão: em euros, ou um veredicto sim/não (Potência, Tarifários e Qualidade; o Relatório na tarefa abaixo). Potência: margem e preço em "Ajustar…", 5 momentos de maior potência; Qualidade: zona no fim; números e unidades sem quebra de linha (`UNIT_SPACE`)
- [x] As notas de cada cartão num "Como é calculado" que se abre (um componente comum)
- [x] Tabelas no telemóvel como listas (Tarifários primeiro: a poupança tem de se ver; depois eventos e episódios de tensão)
- [x] Consumo: gráfico primeiro; "Quanto custam os aparelhos", "Ao segundo" e calibração em Consumo › Aparelhos (`/consumo/aparelhos`); a previsão fica inteira (o Início liga para `#previsao`)
- [x] Definições: índice dos grupos (Tarifário, Dados e Shelly, Avisos, IA, Casa, Conta), com o tarifário primeiro; botões com a mesma largura; ficheiro com um botão estilizado. As ligações para uma parte de uma página (`/consumo#previsao`, `/definicoes#tarifario`) descem até ela (`use-hash-scroll.ts`)
- [x] Relatório: sugestões logo a seguir ao custo; o consumo base com o custo do mês
- [x] Página de entrada como a do Faturómetro (ver Decisões, 2026-10-29): o que a app faz, de onde vêm os dados, privacidade e como funciona, com uma ilustração de um dia; "Ver demonstração" como botão principal e o login em `/entrar`; o quadro "Aplicação" só aparece onde a app ainda não está instalada
- [x] Largura útil maior no computador: 960 px (1200 px com o menu recolhido), o texto ocupa a largura do cartão, gráficos até 720 px, Início em duas colunas (ver Decisões, 2026-10-28)

### 10.3 Texto
- [x] "Palavra-passe" em vez de "password"; explicar "DD+FE", "percentil", "± 10 %" (230 V ± 10 %); a introdução da Potência partida em duas frases

---

## Fase 11 — Mercado

Estudo de 27/10/2026 (Sense, Emporia, Smappee, Ecojoko, Tibber, Homey, Octopus, Loop, Home Assistant, app Shelly; em Portugal: Balcão Digital e app E-Redes, simuladores ERSE e DECO, apps dos comercializadores, indexados, Cleanwatts). Ninguém junta o perfil real a 15 min com as ofertas ERSE, a potência pelos picos ao segundo e o registo de tensão para reclamar; o mais parecido é o Ecojoko (França). Faltas: instalação técnica, importação manual da E-Redes, sem solar nem indexados. Cada valor regulatório novo precisa de fonte em `docs/` antes de implementar.

- [x] Tarifários indexados (OMIE horário/15 min) com o perfil real, comparados com os fixos e com o risco: `pnpm omie:sync` → `public/data/omie-pt.json`; nas ofertas à hora, a estimativa da ERSE corrigida pelo efeito do horário da casa (`src/domain/indexed.ts`, `docs/omie.md`); também no Início e na ferramenta `simulate_tariffs`
- [x] "Melhores horas de amanhã" pelo OMIE do dia seguinte, com aviso no telemóvel: o Cron lê o ficheiro do dia seguinte (`server/src/omie.ts`, `omie_days`), cartão "Amanhã no mercado" em Tarifários e aviso opcional "Horas mais baratas de amanhã"
- [x] Dossiê de reclamação: em Qualidade › Reclamar, os passos (RQS art. 60.º, 61.º, 66.º, 123.º a 125.º) e uma carta com os factos medidos (semanas fora da norma, extremos, cortes acima do padrão), editável, copiável e impressa numa página à parte do PDF (`src/domain/complaint.ts`, `docs/voltage.md`)
- [x] Compensações por interrupções (RQS): número e duração contra os limites da zona; estimativa em euros pelo art. 102.º com os valores do Anexo I e o limite de 200 % da tarifa de uso das redes (`src/domain/compensation.ts`, `docs/voltage.md`)
- [x] Mudar de potência: poupança por ano de cada escalão simulado ao lado do risco de corte, e os passos da ERSE quando o recomendado é outro (`docs/contracted-power.md`)
- [x] E-Redes com menos trabalho: lembrete mensal (aviso quando o último dia importado tem mais de 31 dias); falhas nos dados guardados em Definições (dias sem dados, dias incompletos, quartos de hora estimados); os passos dizem que datas pedir (12 meses na primeira vez, depois do primeiro dia em falta até ontem); modo "só E-Redes": o Início mostra o último dia importado (energia e custo) e o que um Shelly acrescenta, a Potência explica o que falta sem parecer um erro e a Qualidade não mostra zeros quando não há Shelly
- [ ] Solar: dimensionar com o perfil real (PVGIS) e medir a produção no 2.º canal do Shelly (UPAC)
- [ ] Relés Shelly: termoacumulador e outras cargas nas horas baratas (o browser decide, o Shelly só cumpre horários)
- [ ] Carro elétrico: custo de carregar e a melhor hora e tarifário
- [x] Tarifa social: elegibilidade e desconto — cartão em Tarifários com os critérios da ERSE (outubro de 2026, adaptados do Faturómetro, só a luz; `docs/social-tariff.md`), respostas só no ecrã, e a poupança estimada com o consumo dos últimos 12 meses (desconto médio de 33,8 % na energia e na potência, mais o IEC); a quem já tem o desconto no tarifário, só o diz
- [x] Lembrete para rever o tarifário duas vezes por ano (janeiro e julho); orçamento mensal com aviso (Consumo › Previsão; o browser converte euros em energia por dia, o Cron compara kWh: `src/domain/budget.ts`, `docs/alerts.md`)
- [ ] Intensidade carbónica (REN Data Hub): "horas verdes"
- [x] Instalação guiada do Shelly: Definições → Dispositivos → "Instalar um Shelly" (`/definicoes/instalar-shelly`), com uma folha para imprimir e entregar ao eletricista (pinça só na fase, sentido K → L, alimentação da mesma fase; fontes em `docs/shelly.md`) e uma verificação do último minuto de cada Shelly (envia, tensão, pinça ao contrário, pinça que não mede nada) mais o teste com uma chaleira
- [ ] Acompanhar o acesso a dados da E-Redes por terceiros (Regulamento de Execução (UE) 2023/1162)

---

## Riscos e questões em aberto

| Risco / questão | Mitigação |
|---|---|
| Limites do script do Shelly (memória, HTTPS) | Validar na Fase 1.1 antes de desenhar o payload final |
| 500 MB por base D1 no plano gratuito | Retenção de `readings_1s` (90 dias) e `readings_1m`; base separada se necessário; alerta de tamanho |
| Tamanho do pedido por minuto e memória do script | Inteiros compactos; medir na Fase 1.1; em falta de memória, a fila descarta primeiro os arrays ao segundo |
| 10 ms de CPU por pedido | Worker fino; agregações em SQL; cálculos no browser |
| Formato do CSV E-Redes | Parser tolerante; fixtures reais privadas |
| Valores regulatórios mudam | Dados versionados com fonte e data em `docs/` |
| Dados de consumo revelam presença em casa | D1 na UE, login próprio, nada em analytics; rever antes do público |
| Tempo real só ao minuto | Assumido; app Shelly para o valor ao segundo |

## Decisões

- 2026-10-29 — Aviso push de dia fora do habitual: o Cron aplica o teste da app (`judgeDay`, extraído de `findAnomalies` e partilhado) aos totais diários de `daily`, não aos quartos de hora (escolha do utilizador: ~85 linhas em vez de ~8 000 por dia, CPU folgada). Sem temperatura no Worker: só nas casas que disseram que ela não conta.
- 2026-10-29 — Casa só com E-Redes: a Qualidade esconde os resumos quando a casa não tem nenhum Shelly ("0 cortes" lia-se como "não houve cortes", quando nada foi medido). As falhas da E-Redes vêm do `daily` (quartos de hora e estimados por dia), sem ler os 15 min.
- 2026-10-21 — Nome do projeto: **wattometro** (marca Wattómetro).
- 2026-10-21 — Stack igual ao Faturómetro: PWA Vite + React + TypeScript; Worker TypeScript + D1 (`--jurisdiction eu`); pnpm; Vitest. Router Hono no servidor.
- 2026-10-21 — Só Shelly como hardware; Efergy fora do âmbito; sem PC/hub em casa.
- 2026-10-21 — Shelly envia, uma vez por minuto e diretamente para o Worker, o agregado do minuto **e os 60 valores ao segundo**; alerta de potência local no Shelly.
- 2026-10-21 — Script do Shelly sem lógica de deteção: deteção de eventos e NILM no browser sobre `readings_1s` (BLOB por minuto, 90 dias), para poder melhorar e reprocessar. Modo de calibração guarda assinaturas sem expiração.
- 2026-10-21 — Cálculos, ML e IA no browser; Worker só recebe, grava, agrega (SQL) e serve.
- 2026-10-21 — Multi-casa e camada de repositório desde o início, para permitir crescer sem reescrita.
- 2026-10-21 — Licença AGPL-3.0-or-later; CLA para contribuições externas.
- 2026-10-21 — Conta Cloudflare própria (separada da do Faturómetro, que tem o subdomínio `faturometro`): conta de wattometro@outlook.com, Account ID `0fcf1ed22512b5ad46f39cf8eb61d82f`, subdomínio `wattometro.workers.dev`. A app é o Worker `app` (`app.wattometro.workers.dev`); o `account_id` fica explícito em todos os `wrangler*.toml`.
- 2026-10-21 — Workers: `app` (PWA, `app.wattometro.workers.dev`) e `api`. Uma só origem: o `app` encaminha `/v1/*` para o `api` por service binding (`server/src/gateway.ts`) e o `api` não tem endereço público (`workers_dev = false`). Motivo: uma só origem dispensa CORS e cookies entre domínios (pensado para o Access, continua certo com o login próprio). D1 `wattometro` (id `78e9cd53-…`, região EEUR, `--jurisdiction eu`).
- 2026-10-21 — Deploy manual por agora (`pnpm deploy:server`, `pnpm deploy:app`); o CI no GitHub só faz verificações. Ícones da PWA gerados de `public/icon.svg` com fundo da marca nos ícones maskable/Apple.
- 2026-10-21 — **Cloudflare Zero Trust posto de parte** (o plano Free pede cartão de crédito, como no poderebeleza). Login próprio adaptado do poderebeleza: tabela `users` (com `household_id`), PBKDF2-SHA256 100 000 iterações (medido em produção: cabe no limite de CPU gratuito), sessão de 30 dias em cookie `__Host-wm_session` assinado (HMAC, secret `SESSION_SECRET`), `session_version` para terminar sessões, 5 falhas → 15 min de bloqueio, contas só por `pnpm user:create`.
- 2026-10-21 — Sessão deslizante (renovada quando usada mais de 24 h depois de emitida; termina ao fim de 30 dias sem uso). Página Definições: conta, sair, nome da casa, mudar a password (termina as sessões noutros dispositivos). Testado em produção: duas verificações PBKDF2 no mesmo pedido cabem no limite de CPU gratuito.
- 2026-10-21 — Logótipo: "Traço W" — um W (de Watt) sob o arco de um mostrador, ciano `#5fdde3` e branco `#f6f7f4` sobre violeta `#2e2250`; mesma construção do ícone do Faturómetro. Fonte: `public/icon.svg` (gera os ícones da PWA); versão com nome em `assets/logo-lockup.svg` (texto ainda por converter em contornos).
- 2026-10-22 — Hardware: **Shelly EM Gen3** (monofásico, 2 canais, scripts). O Shelly EM Gen1 encomendado primeiro não serve (sem scripts). `docs/shelly.md` escrito a partir da documentação oficial; confirmações pendentes listadas lá.
- 2026-10-22 — Valores ao segundo: **P (W), potência não ativa √(S² − P²) (VAr) e V (dV)**, int16 (formato 1 de `docs/readings-1s.md`, 361 bytes/min ≈ 47 MB em 90 dias). O FP a 1 % esconderia 70–145 VAr com 2 kW de base; a tensão permite normalizar a potência a 230 V na deteção. A não ativa não tem sinal (o Shelly não distingue indutiva de capacitiva).
- 2026-10-22 — Energia por minuto = `floor(contador no fim) − floor(contador no início)`: inteiros em Wh cuja soma é exatamente a do contador do Shelly.
- 2026-10-22 — Leituras com **canal** na chave (`device_id, channel, ts`), para uma segunda pinça sem migração. Tabelas com `household_id`.
- 2026-10-22 — Ingestão: token por dispositivo (`Authorization: Bearer`, SHA-256 na base), payload JSON formato 1 com chaves curtas (o Shelly envia no máximo 8192 bytes por pedido → lotes de ~6 minutos), cada minuto validado à parte (um minuto inválido não bloqueia os outros), reenvios contam como duplicados, escrita num só `batch` D1 (transação), 20 pedidos/min por dispositivo (`INGEST_REQUESTS_PER_MINUTE`).
- 2026-10-22 — Script do Shelly: fila em RAM até 240 minutos; com pouca memória descarta primeiro os valores ao segundo dos minutos mais antigos; espera de 10 s a 5 min entre tentativas falhadas. JavaScript conservador e fora do Prettier (sem vírgulas finais).
- 2026-10-22 — Agregações por **contador** (`meter` = `device_id:channel` do Shelly, ou `eredes`), não pela casa: com uma segunda pinça num circuito, somar canais contaria a mesma energia duas vezes. Que contador é o "geral" da casa decide-se na Fase 2, ao comparar com a E-Redes.
- 2026-10-22 — Cron a cada 5 min: recalcula os quartos de hora das últimas 6 h (a fila do Shelly guarda 4 h) e os dias que tocam nesse intervalo; atualização só quando os valores mudam (poupa escritas D1); recuperação de histórico às semanas. `readings_15m` guarda também o pico ao segundo e a tensão mín./máx.; `daily` é calculado a partir dos quartos de hora. Purga uma vez por dia; tamanho da base lido do `meta.size_after` do D1. Retenções e limite por variáveis no `wrangler.toml`.
- 2026-10-22 — "Agora" lê os minutos de hoje diretamente (até 1440 linhas por contador): simples e sempre fresco para uso familiar; em grande escala passa a ler `readings_15m` + o último quarto de hora.
- 2026-10-22 — Instalação da app (copiada do Faturómetro, `src/app/install.ts`): botão "Instalar app" no Chrome/Edge, passos por browser nos outros (iPhone/Safari, Samsung, Firefox); no ecrã de entrada e em Definições. Rodapé ao estilo do Faturómetro: © 2026 Paulo Barbosa, "Sugestões e problemas" por email (`wattometro@outlook.com`, abre o programa de email do utilizador com versão e página), licença AGPL-3.0, código no GitHub, versão.
- 2026-10-22 — **Fase 3.1–3.2 antes da Fase 2**: enquanto não há CSV da E-Redes nem Shelly, avança-se com os dados de referência e o motor de custos (dão já o custo de hoje na página Agora). A Fase 2 retoma quando chegar o CSV.
- 2026-10-22 — Períodos horários tirados da **calculadora oficial da ERSE (CP 137, 31/07/2026)**, convertidos para hora legal por script e conferidos com o PDF de 2020, a Diretiva 3/2026 e as perguntas e respostas da ERSE; um só mapa ponta/cheias/vazio por ciclo, bi-horário derivado. Feriados em BTN seguem o dia da semana. O mapa novo (2027) é uma escolha do tarifário, porque a data de mudança é por contador (julho–dezembro de 2027). Ponta da manhã de inverno no ciclo diário às 9:00 (fontes de 2026), não às 8:30 do gráfico de 2020.
- 2026-10-22 — Dados de referência pequenos (ciclos, escalões, IVA) em **`src/data/*.json`**, importados e validados com zod (funcionam offline, sem pedido); `public/data/` fica para ficheiros grandes servidos à parte (ofertas ERSE, 1,7 MB, fora do precache).
- 2026-10-22 — Preços unitários em **micro-euros inteiros** (`MicroEuros`, `src/lib/money.ts`): os preços têm até 6 casas decimais. Custo = Wh × µ€/kWh em nano-euros (BigInt), arredondado a cêntimos uma vez por componente (energia, potência, taxas).
- 2026-10-22 — Taxas da fatura (IEC €/kWh, CAV e DGEG €/mês) copiadas da fatura pelo utilizador para o tarifário (não há fonte regulatória no repositório); CAV/DGEG repartidas por dia × 12/365. IVA do IEC por confirmar com uma fatura real (`docs/electricity-vat.md`).
- 2026-10-22 — O custo de hoje vem dos quartos de hora agregados em SQL a partir dos minutos (`/v1/now`), classificados no browser. Com vários contadores, cada cartão mostra o seu custo completo (inclui o termo de potência) até se escolher o contador geral da casa (Fase 2).
- 2026-10-22 — Limites de tensão da NP EN 50160 (paga) tirados da reprodução da ERSE (Formação ACE, 2021), coerente com a E-Redes (DIT-C14-100) e o RQS (art. 25.º): ± 10 % em 95 % dos valores de 10 min de cada semana, + 10 % / − 15 % sempre. Semana = segunda a domingo em Lisboa; os valores de 10 min que tocam uma falha ficam de fora.
- 2026-10-22 — Falhas de energia detetadas pelo **arranque do Shelly** (o script 0.2.0 envia `b` = unixtime − uptime; campo opcional, scripts antigos continuam a funcionar). Uma falha de internet não reinicia o Shelly, por isso não conta. Início = fim do último minuto antes do arranque (precisão ~1 min). O utilizador pode marcar falhas que não contam; a app não distingue acidentais de previstas.
- 2026-10-22 — Valores de 10 min (`voltage_10m`) agregados pelo Cron em SQL; episódios por minuto pedidos ao servidor só para os minutos fora da banda. O "PDF" é a impressão da página (estilos de impressão), sem biblioteca.
- 2026-10-22 — Potência contratada: simula-se no browser, segundo a segundo, a **curva de corte do contador inteligente** (E-Redes DEF-C44-506/N, anexo B1, valores por omissão Q = 50, k = 1,2 monofásico) com a potência **aparente** √(P² + Q²) dos últimos 90 dias (retenção de `readings_1s`). O servidor guarda o pico aparente de cada minuto (`apparent_max_va`, calculado no ingest) e só envia os minutos acima do limiar de cada escalão (registos binários). Minutos sem valores ao segundo contam com o pico ativo durante o minuto inteiro (assinalado). Margem por omissão 10 %. Trifásico ainda não simulado.
- 2026-10-22 — Poupança da potência: só o termo de potência com IVA × 365 dias; o preço do escalão recomendado vem da oferta ERSE com o mesmo termo de potência atual (o utilizador pode escrever outro).
- 2026-10-22 — Navegação: no telemóvel, barra fixa em baixo (ícone + nome); a partir de 768 px, menu lateral que se recolhe aos ícones (escolha guardada no browser), como no Faturómetro. Estado do servidor e "Sair" no cabeçalho, em todas as páginas.
- 2026-10-22 — Demonstração sem conta: casa fictícia gerada no browser (`src/demo/`), que responde às mesmas rotas `/v1/*` sem contactar o servidor; alterações só em memória, conta e dispositivos fixos. Em vez de um utilizador de teste no servidor (password pública, dados de teste na base real).
- 2026-10-22 — Exportação da E-Redes: `.xlsx` com kW médios por quarto de hora e a hora a marcar o fim do intervalo (`docs/eredes-csv.md`). Lida no browser; ao servidor só vão os quartos de hora (sem CPE nem número de contador). Cada lote é gravado com duas instruções SQL (`json_each`), qualquer que seja o tamanho. O dia de 25 h vem com 4 quartos de hora em falta (a hora repetida aparece uma vez): a app aceita a falha e mostra-a.
- 2026-10-22 — Simulador de tarifários: consumo dos últimos 12 meses (E-Redes ou Shelly, o contador com mais dados), extrapolado se houver menos de 360 dias. A tarifa social, o seu financiamento, o IEC, a CAV e a taxa DGEG vêm do tarifário da casa e são iguais em todas as ofertas. Preços, descontos e serviços obrigatórios vêm de cada oferta (o desconto social é aplicado igual em todas as opções horárias, como no Faturómetro). Bi e tri-horário: o ciclo mais barato. "Mudar para o vazio" compara com a opção simples mais barata (atual ou oferta).
- 2026-10-23 — Consumo base: por noite (00:00–06:00, hora de Lisboa), percentil 10 da potência média dos quartos de hora (pelo menos 12 quartos de hora); por mês, a mediana das noites; "agora", a mediana das noites dos últimos 30 dias de dados. Custo anual = custo do ano medido − custo sem o consumo base (energia, IEC e IVA; repartido pelos períodos como as horas dos dados). Página `/consumo`, com 12 meses de quartos de hora pedidos uma vez (≈ 35 mil linhas lidas por visita).
- 2026-10-23 — Gráficos de consumo em SVG feito à mão (`src/components/Charts.tsx`), sem biblioteca: são poucas dezenas de barras ou células. Dia: barras de 15 min; semana e mês: uma barra por dia, empilhada pelos períodos do tarifário da casa (uma cor na opção simples). Mapa de calor: média por hora e dia da semana nas últimas 12 semanas com dados.
- 2026-10-23 — Leituras do D1 nas páginas Consumo e Tarifários: a lista de contadores vem da tabela `daily` (≈ 365 linhas em vez de ≈ 35 mil) e os quartos de hora ficam numa cache local do browser (IndexedDB, `src/app/energy-cache.ts`). Em cada visita a app pede os totais por dia (`GET /v1/energy/days`) e volta a pedir só os dias em falta ou cujo total mudou (novos dados, nova importação, minutos atrasados do Shelly); durante 5 min, as páginas partilham o resultado sem pedir nada. A cache apaga-se ao sair; a demonstração nunca é guardada.
- 2026-10-23 — Relatório mensal: comparações por média diária (meses de 30/31 dias e dias sem dados não contam como mudanças); custo com o tarifário em vigor no fim do mês, para os dias com dados; potência máxima = quarto de hora mais alto (média de 15 min). Sugestões por regras fixas, limites escolhidos pela app (não regulamentares): consumo base > 20 % do mês; tri-horário com ponta > 25 %; bi-horário fora do vazio > 65 %; > 15 % por dia acima do mesmo mês do ano anterior; pico < 50 % da potência contratada; opção simples → simulador. PDF pela impressão do browser. Consumo, Tarifários e Relatório partilham uma janela de dados (desde o dia 1 do mês de há 13 meses; limite do servidor 430 dias) e a mesma cache.
- 2026-10-24 — Clima: Open-Meteo pedido **no browser** para a **localidade** escolhida em Definições (geocodificação da Open-Meteo, só Portugal), guardada arredondada a 0,01° (`households.location_name/latitude_cdeg/longitude_cdeg`, migração 0010) — nunca morada nem GPS; a Open-Meteo guarda IP e coordenadas 90 dias (`docs/open-meteo.md`). Temperatura horária em décimas de °C inteiras; cache em IndexedDB por mês UTC (os meses com mais de 8 dias deixam de ser pedidos), previsão de 16 dias em memória durante 1 h. Cinco anos de arquivo para a temperatura habitual (±7 dias da mesma altura do ano). IndexedDB direto, como `energy-cache.ts`, em vez do Dexie. Atribuição "Open-Meteo" e "GeoNames" onde aparecem dados.
- 2026-10-24 — Feriados nacionais obrigatórios (Código do Trabalho, art. 234.º, Lei n.º 8/2016) contam como domingo na previsão; Carnaval e feriado municipal ficam de fora (facultativos).
- 2026-10-24 — Previsão da fatura: energia por dia = mínimos quadrados ponderados (meia-vida 120 dias, 365 dias de treino) sobre tipo de dia (útil, sábado, domingo/feriado) e graus-dia de aquecimento/arrefecimento com bases escolhidas pelo melhor ajuste (aquecimento 12–20 °C, depois arrefecimento 20–26 °C); termos negativos rejeitados; **ancorada no nível recente** (erro médio do modelo nos últimos 28 dias), porque sem âncora um ano de dados puxa para a média anual (no ficheiro real: 7,4 % de erro sem temperatura, contra 4,2 % da baseline). Os dias por medir — incluindo os que a E-Redes ainda não enviou — são previstos e repartidos pelos quartos de hora como os dias recentes do mesmo tipo, para os períodos horários saírem certos; custo pelo motor de custos com o tarifário em vigor no fim do mês. Menos de 28 dias completos: média das últimas 4 semanas (baseline). Backtest aos dias 5, 10, 15, 20 e 25 de cada mês completo, com a temperatura habitual para o resto do mês; a margem mostrada é o percentil 10–90 dos erros das previsões feitas no dia mais próximo (pelo menos 4). Corre no browser (~0,2 s com tri-horário: `dayBillingPeriods` classifica um dia com duas consultas ao fuso horário).
- 2026-10-24 — Resultado no ficheiro real da E-Redes (12 meses, opção simples, temperatura de Lisboa provisória): modelo 4,08 % de erro médio, baseline 4,16 %; mesmo com previsão meteorológica perfeita a 16 dias o ganho é pequeno — o consumo desta casa parece pouco sensível à temperatura. Repetir com a localidade real e com mais meses.
- 2026-10-24 — Com a temperatura da localidade real (Lavra, Matosinhos), a temperatura **piora** a previsão desta casa (4,29 % contra 4,15 % sem ela; baseline 4,16 %). A app passa a **escolher por casa**, pelo backtest, entre modelo com temperatura, modelo só com o tipo de dia e média das últimas 4 semanas (empates para o mais simples; com menos de 10 previsões passadas, o modelo completo). Aqui fica "só tipo de dia".
- 2026-10-24 — Localização também pela **posição do dispositivo** (pedido do utilizador): só ao carregar no botão, com a autorização do browser (`Permissions-Policy: geolocation=(self)`), arredondada logo a 0,01°, mostrada com link para o mapa e guardada só depois de confirmada. A geocodificação da Open-Meteo não aceita códigos postais portugueses: a app explica que se procura pelo nome.
- 2026-10-25 — **Leituras do D1 esgotadas outra vez** (5 M linhas/dia, bloqueio das 07:05 à meia-noite UTC; o utilizador preferiu esperar a pagar o plano Workers Paid). Causa: o resumo diário do Cron (`rollUpDay`) procurava os quartos de hora sem dizer o contador e lia os ~35 000 da E-Redes a cada 5 min. Agora nomeia os contadores (chave primária `household_id, meter, ts`); um teste verifica o plano das consultas. Regra: consultas a `readings_15m` dizem sempre o contador.
- 2026-10-25 — **Reconciliação Shelly/E-Redes** a partir dos totais diários (`/v1/energy/days` passa a levar os minutos com dados de cada dia; E-Redes sem minutos): um dia só conta se o Shelly tiver todos os minutos do dia de Lisboa (1440, ou 1380/1500 na mudança de hora), porque um dia com falhas subestima o Shelly. Diferença = (Shelly − E-Redes) / E-Redes; dias a mais de 3 pontos da diferença global aparecem à parte. A diferença real da casa fica por documentar: os dados só se sobrepõem quando for importado um ficheiro da E-Redes posterior a 24/10/2026.
- 2026-10-25 — **Limite de leituras do D1 visível:** cada pedido e cada execução do Cron somam as linhas que leram (`meta.rows_read`) num contador por dia UTC (`maintenance_state`, uma escrita a mais por pedido); o Início avisa a partir de 50 % de `ROWS_READ_LIMIT`. Passado o limite, o servidor responde 503 `database_limit` e `/v1/health` diz até quando; a app mostra "Base de dados em pausa" em vez de só falhar o login.
- 2026-10-25 — **Eixo de valores nos gráficos do Consumo:** o Dia mostra a potência média de cada quarto de hora (W/kW, = Wh × 4), a Semana e o Mês kWh por dia; valores redondos a partir de zero.
- 2026-10-25 — **Hora do Shelly na mudança de hora:** perderam-se ~2 h na hora repetida (`docs/shelly.md`, «Hora»). Script 0.3.2: segue a hora que o servidor devolve em cada resposta de `/v1/ingest` (`now`, campo novo; scripts antigos ignoram-no) quando o relógio do Shelly está desviado mais de 60 s.
- 2026-10-25 — **O EM Gen3 esvazia o KVS em cada reinício** (firmware 2.1.0; `docs/shelly.md`, «KVS»). Uma falha de luz às 21:47 deixou o script sem URL nem token: 129 minutos perdidos, e o aviso «Sem dados há 150 minutos» na app. Script 0.3.1: `pnpm shelly:install` grava o URL e o token na cópia do script enviada para o Shelly (o código sobrevive aos reinícios); o KVS continua a ter prioridade. O token fica no `.env` (ignorado pelo Git), nunca no repositório.
- 2026-10-25 — **"Casa (E-Redes) + Shelly" compara os dois sistemas no gráfico** (pedido do utilizador): linhas na vista Dia, barras lado a lado em Semana e Mês, e a diferença do Shelly face à E-Redes nos quartos de hora (ou dias completos) que os dois têm. As outras contas (previsão, consumo base, tarifários, relatório) continuam com a série única. A vista Dia mostra sempre o dia inteiro no eixo, com horas de 3 em 3.
- 2026-10-24 — **Série "Casa" no Consumo, Tarifários e relatório:** com E-Redes e Shelly, a escolha por defeito junta os dois — E-Redes até ao último dia importado (é o que se fatura; o ficheiro é descarregado à mão e chega com atraso), Shelly nos dias seguintes; os buracos antes desse dia não se preenchem com o Shelly. O dia de hoje, ainda a decorrer, aparece só nos gráficos (de `/v1/now`), marcado "até agora"; totais, previsões e comparações continuam a usar dias completos.
- 2026-10-24 — **Alerta de potência: só registo na app** (escolha do utilizador; sem notificações nem relé por agora; quando houver notificações, para Android e iPhone). Sem ação local, a deteção não precisa de estar no Shelly: corre no browser sobre os valores ao segundo (90 dias), com a curva de corte por omissão e sem margem. Uma sobrecarga que continua depois do corte simulado conta como um só episódio (nos dados a potência continua, mas na realidade o contador já teria cortado).
- 2026-10-24 — **Shelly real.** O total de energia muda 1×/min, ~1,2 s depois do minuto, por isso o script 0.2.1 lê a energia de cada minuto 5 s depois de ele acabar (com o 0.2.0, minutos de 0 e de 12 Wh a potência constante). A memória de um script é ~25 KB e o pico de um envio é ~3,3 KB + 4 × o corpo: com o 0.2.1, um corte de internet de ~6 min parou o script (`out_of_memory`). O 0.3.0 dimensiona cada envio à memória livre (corpo ≤ 2200 bytes) e descarta primeiro os valores ao segundo dos minutos mais antigos; num corte simulado de 25 min no aparelho, nenhum minuto se perdeu (pico de 21,3 KB). Cabem ~30 min de corte sem perdas, à justa para a aceitação da Fase 1 (corte de 30 min); para cortes mais longos, guardar os resumos de forma mais compacta fica como melhoria. Rede de segurança: agendamento no Shelly que chama `Script.Start` a cada 5 min.
- 2026-10-24 — Validação com 3 faturas: a leitura real "de 21/08" da fatura de agosto inclui o consumo de 22/08 (244 kWh faturados; o ficheiro da E-Redes dá 237,5 kWh até 21/08 e 244,8 kWh até 22/08), ao contrário de junho e julho. A fatura está certa face às suas leituras; para comparar com os quartos de hora, a fatura privada indica `meterPeriod`. Consequência para a reconciliação com faturas (Faturómetro, Fase 9): as datas das leituras podem estar desfasadas um dia, e isso não é um erro de medição.
- 2026-10-24 — **Perfil da instalação** declarado pelo utilizador (pedido do utilizador; a casa de referência aquece com caldeira a gás e radiadores e não tem ar condicionado). Todas as respostas podem ficar "Não sei". É uma pista, não substitui os dados: se o aquecimento não é elétrico e não há ar condicionado, a previsão nem pede a temperatura à Open-Meteo e explica porquê; com respostas desconhecidas, o backtest decide como antes. Servirá também às anomalias, às recomendações (termoacumulador no vazio, painéis solares que a E-Redes não vê) e ao contexto da IA.

- 2026-10-25 — **Leituras do D1 sob vigilância nos testes.** O limite gratuito (5 milhões de linhas lidas por dia) bloqueou a app duas vezes por consultas que liam uma tabela inteira. Agora `server/test/sqlite.ts` verifica o plano (`EXPLAIN QUERY PLAN`) de cada consulta dos testes do servidor: percorrer `readings_1m`, `readings_1s`, `readings_15m` ou `voltage_10m` inteiras, ou procurá-las só pela casa ou pelo aparelho, faz falhar o teste. A única exceção é um `MIN`/`MAX(ts)` simples num índice `(household_id, ts)`, que lê uma linha. Migração 0012: `daily` passa a ter quartos de hora e estimados por dia da E-Redes (o resumo da importação soma os dias em vez de ler cerca de 35 mil quartos de hora; os dias importados antes completam-se ao reimportar o export) e `voltage_10m` ganha o índice `(household_id, ts)`. O início de um corte procura o último minuto até 7 dias antes do arranque, pelo índice da casa; mais tempo sem minutos não é um corte.
- 2026-10-25 — **O chat deixa de ser uma página.** A pedido do utilizador, como no ifanalysis: um botão "Perguntar à IA" no canto inferior direito de todas as páginas (exceto Definições) abre a conversa num painel (ecrã inteiro no telemóvel). A conversa mantém-se entre páginas; as sugestões de perguntas mudam com a página e a IA recebe só o nome da página (prompt `chat-2`). Os botões "Explicar com IA" ficam onde estão; `/perguntar` abre o painel no Início.
- 2026-10-25 — **Minutos perdidos recuperados do registo interno do Shelly.** O EM Gen3 guarda sozinho um registo por minuto durante pelo menos 10 dias (`docs/shelly.md`, "Registo interno"); o D1 bloqueado nesse dia mostrou que a fila em RAM do script (~30 min) não chega. `GET /v1/ingest/missing` diz que minutos faltam; o script 0.4.0 preenche-os sozinho e `pnpm shelly:backfill` faz o mesmo a partir do PC. Esses minutos não têm valores ao segundo (nem NILM, nem calibração) e o fator de potência é estimado com `P / (V × I)`; o pico aparente vem do registo (`sx`). Minutos antigos fazem recuar as agregações do Cron, para os quartos de hora e os dias serem recalculados.
- 2026-10-26 — **A chave da IA segue a conta.** A pedido do utilizador (no telemóvel não aparecia a chave guardada no PC), como no ifanalysis: o Worker cifra a chave com AES-256-GCM, com uma chave derivada (HKDF) do segredo `AI_KEY_SECRET` e o id do utilizador como dados adicionais (`server/src/secret-box.ts`), e guarda-a em `user_ai_settings` (migração 0014). `GET/PUT/DELETE /v1/ai-settings`; cada browser guarda uma cópia e as perguntas continuam a ir diretamente do browser para a Anthropic (o Worker não fala com ela). Considerado e posto de lado: a cifra com a password do Faturómetro, porque aqui o servidor já recebe a password ao entrar e obrigava a escrevê-la em cada aparelho. Sem `AI_KEY_SECRET` (ou offline, ou na demonstração), a chave fica só no browser. Em Definições: um olho para mostrar a chave, Guardar, Testar e Apagar (em todos os aparelhos). O histórico de custos continua por browser.
- 2026-10-26 — **Avisos por Web Push.** O utilizador aceitou os serviços de push dos browsers como ligação externa (regra 1 atualizada), só para avisos cifrados de ponta a ponta e sem medições. Cifra (RFC 8291) e VAPID (RFC 8292) feitas com WebCrypto no Worker, sem bibliotecas de Node. Três avisos, verificados pelo Cron a cada 5 minutos: Shelly sem enviar há 15 min (e de volta), potência acima de 1,2 × a contratada (escolha do utilizador: o ponto em que o contador começa a contar, não os 100 %), e D1 a 80 % das leituras diárias. Cada aparelho escolhe os seus em Definições → Avisos; no iPhone só com a app no ecrã principal.
- 2026-10-26 — **Aparelhos com nome (8.3).** Um aparelho é um nome e um descritor (potência a 230 V, potência de cada fase, pulsos), guardado no servidor para todos os aparelhos da conta verem o mesmo. Nasce de "O que é?" num grupo de ciclos ou de uma calibração. A classificação corre no browser sobre os ciclos de cada dia; a tolerância (25 W ou 5 %) é um pouco mais larga do que o agrupamento de um dia (20 W ou 3 %), pela variação entre dias, e foi apertada depois de, na demonstração, um televisor de 150 W passar por frigorífico de 110 W com 40 W. Por agora não guarda os ciclos classificados (tabela `events`): recalcula-se a partir dos valores ao segundo, o que também deixa reprocessar quando o algoritmo melhorar.
- 2026-10-26 — **Deploy automático pelo CI.** A pedido do utilizador, como no faturometro: num push ao `main`, depois das verificações, o job `deploy` aplica as migrações D1 e publica o `api` e a `app`, com um token de conta guardado no segredo `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1 e Workers Routes, Edit). Sem o segredo, o job só deixa um aviso. Substitui o deploy manual de 2026-10-21.
- 2026-10-26 — **Duração dos ciclos no reconhecimento.** A primeira calibração real (máquina de lavar, 26/10 13:29–14:57) deu um só ciclo útil: o aquecimento, 1,96 kW durante 11 min. Só pela potência, apanharia a chaleira e outros aparelhos resistivos de ~2 kW. O utilizador lembrou que as máquinas de lavar e de secar têm programas de durações diferentes: por isso a duração é um intervalo largo (metade a dobro) que se alarga sempre que se dá o mesmo nome a outro ciclo, e não um valor fixo.
- 2026-10-27 — **Largura da página no computador fica nos 640 px.** A revisão de design sugeria ~960 px; com texto corrido, linhas de 900 px passam bem dos ~80 caracteres que se leem bem, e os cartões são sobretudo texto e tabelas curtas. Volta-se a isto se houver um painel com vários números lado a lado.
- 2026-10-27 — **Ofertas indexadas: a estimativa da ERSE corrigida pelo horário da casa.** O texto das ofertas quase nunca traz todos os parâmetros da fórmula (margem, custos de gestão, perdas), por isso a app não recalcula o preço: nas ofertas com preço à hora soma ao preço estimado pela ERSE a diferença entre o preço OMIE pesado pelo consumo da casa e a média simples do mesmo período; nas de média do mês e nas sem fórmula fica o preço da ERSE. A classificação (`src/data/indexed-offers.json`) vem do texto de cada oferta e está em `docs/omie.md`. Perdas na rede deixadas de fora, e ditas na página (aprovado pelo utilizador). Os preços OMIE vêm de `pnpm omie:sync`, no PC ou no CI, para um ficheiro servido com a app: o browser não liga ao OMIE.
- 2026-10-27 — **O Worker lê o OMIE.** Autorizado pelo utilizador: o Cron pede o ficheiro público do dia seguinte (regra 1 atualizada), no máximo duas vezes por hora até sair, e guarda-o em `omie_days`, uma tabela sem `household_id` por serem dados de mercado iguais para todas as casas. O aviso das horas baratas fica desligado por omissão, porque só conta num tarifário com preço à hora; mostra 3 horas seguidas (uma máquina de lavar, uma carga), não a hora isolada mais barata.
- 2026-10-28 — **Deteção afinada com os programas reais de 27/10.** O emparelhamento passa a ter, por esta ordem: o desligar igual a um ligado; igual à soma de dois ligados (cada um com ≥ 60 W); até 60 % maior do que um ligado quando a casa volta ao nível de antes dele (um compressor que sobe enquanto trabalha; os degraus pequenos da subida vão com ele); a soma de dois com folga para esses degraus; e, se nada servir, dois desligares a menos de 20 s como um só. Nos programas: pedaços de aquecimento a ≤ 30 s juntam-se ao aquecimento; um minuto conta como trabalho com dispersão ≥ 100 W (tambor devagar: 105–155 W; casa parada: 30–70 W) ou 80 W acima do nível de antes; a pausa máxima passa de 10 para 5 min, para a máquina de secar ligada 6 min depois não entrar no programa da lavagem. Limites conhecidos: o programa começa no primeiro aquecimento (o enchimento antes, +30 a 90 W, fica de fora); uma centrifugação feita logo a seguir entra no mesmo programa; um aparelho que desliga no mesmo segundo em que outro liga (micro-ondas e máquina de secar às 21:06) só deixa ver a diferença e não se separa.
- 2026-10-28 — **Arranque em rampa.** A máquina de secar de 28/10 ligou em três degraus (+149, +135, +164 W, cerca de 30 s entre eles) e desligou de uma vez (−487 W, 27 min depois): nenhum ligado nem soma de dois correspondia. Subidas seguidas, sem nenhum degrau entre elas, a ≤ 45 s, cada uma com ≥ 100 W e juntas ≤ 1 kW, passam a ser um só ligado. Os limites evitam juntar uma chaleira e o frigorífico que liguem perto. Avaliação: 8 de 9 aparelhos anotados (26–28/10); continua a faltar a máquina de secar interrompida de 27/10.
- 2026-10-28 — **Compensação por falhas como estimativa.** O regulamento só traz os valores de base (FC = 1,20 €, KC = 0,45 €/kWh em BTN), que a ERSE sobe todos os anos com a inflação; os valores atualizados não foram encontrados publicados. Escolhido pelo utilizador: mostrar "cerca de" com os valores de base, dizendo que o real é um pouco maior. O limite de 200 % usa o valor médio da tarifa de uso das redes do último ano publicado (2025: 0,0514 €/kWh) e a energia do ano até agora.
- 2026-10-28 — **Lembretes e orçamento.** Três avisos novos, desligados por omissão: importar a E-Redes (último dia com mais de 31 dias, no máximo um por mês), rever o tarifário (janeiro e julho) e orçamento do mês (a partir do dia 7). Vistos uma vez por dia a partir das 10:00, para não lerem o D1 a cada 5 minutos. O orçamento é dado em euros em Consumo › Previsão; o browser converte-o em energia por dia com o tarifário e a repartição do mês por períodos, e o servidor guarda as duas coisas: as contas de dinheiro continuam no browser e o Cron só compara kWh.
- 2026-10-28 — **Largura no computador: 960 px** (1200 px com o menu recolhido), como o Faturómetro. Revê a decisão de 2026-10-27: o problema das linhas longas resolve-se limitando o texto corrido (~46rem), não o cartão. Os gráficos SVG mantêm a proporção e crescem até 720 px; o Início passa a duas colunas (ações e previsão à esquerda, o contador à direita).
- 2026-10-28 — **Instrumentos no Início.** Mostrador para a potência (até 1,5 × a contratada; zonas: dentro, acima mas tolerado até k = 1,2, e corte; traço no pico do dia), régua para a tensão (faixa da norma ao centro) e, para a energia, uma barra contra o habitual a esta hora (média dos mesmos dias da semana das 8 semanas anteriores, `src/domain/typical-day.ts`) com a curva do dia. Sem velocímetro para a energia: não tem máximo natural. Sem tarifário, a potência fica só com o número.
- 2026-10-28 — **O texto ocupa toda a largura do cartão** no computador (pedido do utilizador: frases curtas partidas em duas linhas pareciam um erro), em vez do limite de ~46rem. No Início, os avisos da base de dados passam a caixas na coluna da esquerda, e as caixas dessa coluna dividem a altura para acabarem ao nível do cartão do contador.
- 2026-10-28 — **Menos linhas lidas na Potência e no Início** (60–66 % do limite diário de 5 M em poucas horas). A Potência (e o Início, que recomenda o escalão) lia todos os minutos dos últimos 90 dias em cada visita (~130 000 linhas por contador quando houver 90 dias), e o "agora" relia todos os minutos de hoje a cada minuto. Migração 0021: os quartos de hora e os dias guardam também o pico aparente, os minutos com pico aparente e o pico ativo dos minutos sem ele; as consultas leem dias e quartos de hora já agregados pelo Cron e só os minutos do troço ainda por agregar (`splitRange` em `server/src/repo/power.ts`); os minutos acima do limiar só nos quartos de hora cujo pico o passa. Índice `readings_15m (household_id, ts)` para os quartos de hora de hoje. O Início reaproveita o escalão recomendado durante 30 min. Testes garantem que o resultado é o mesmo antes e depois das agregações.
- 2026-10-28 — **Custo e pico de hoje no Início** passam a caixas na coluna da esquerda (com um só contador), no mesmo formato das outras; o cartão do contador fica com a potência, a energia de hoje e a tensão.
- 2026-10-28 — **Painel do administrador** (Definições → Servidor, `docs/admin.md`), como no Faturómetro: só para os emails do segredo `ADMIN_EMAILS`, só totais (linhas lidas e escritas por dia contra os limites, tamanho da base, Cron, Shelly sem nomes, contas, visitas por página). A percentagem de linhas lidas sai do Início (pedido do utilizador): fica no painel e no aviso push aos 80 %. **Visitas contadas no próprio D1** (migração 0022: dia, página, número; 90 dias), em vez do Cloudflare Web Analytics, que seria mais uma ligação externa (regra 1).
- 2026-10-29 — **Página de entrada refeita.** As três conclusões da casa de exemplo apareciam sem contexto (pareciam ser da casa de quem chega) e o login, a demonstração e a instalação estavam empilhados. Agora segue o Faturómetro: título e frase sobre o que a app faz, "Ver demonstração" e "Como funciona", uma ilustração de um dia inventado (consumo base, pico abaixo da potência contratada, máquina de lavar, vazio; sem números), faixas com o que faz, as fontes de dados, a privacidade (faixa invertida) e os passos. O login passa para `/entrar` (botão "Entrar" só na barra do topo). O quadro "Aplicação" desaparece quando a app já está instalada no dispositivo. No Início, "Hoje" passa a "Energia hoje" e uma nota diz uma vez que todos os valores em euros têm IVA.
- 2026-10-29 — **Deteção corrigida com a lavagem de 29/10.** (1) Uma máquina de café (1,3 kW, 52 s) ligou com +85 var e desligou com −52 var: fora da tolerância de 30 var, ficou aberta e fechou 1 h 49 min depois com um disco do fogão (1,22 kW), e o fogão do almoço juntou-se-lhe como "pulsos". A potência não ativa vem de √(S² − P²), muito sensível ao lado de uma potência ativa grande: a tolerância passa a ser também 5 % da potência ativa. Encontrou ainda a mesma máquina a 26/10 às 12:52 e fechou degraus soltos a 26 e 27/10. (2) Depois da centrifugação a casa ficou +120 W acima, estável (dispersão de 37–53 W por minuto), e a cauda do programa (minutos ≥ 80 W acima do nível de antes) continuou mais 45 min. Um tambor real nunca é plano (60–150 W por minuto; 88–179 W a 27/10); os patamares de centrifugação (38–56 W) duram no máximo 3 min e ficam entre minutos agitados. O critério do nível passa a exigir também 60 W de dispersão (`LEVEL_SPREAD_W`). Os testes sintéticos tinham um tambor e uma centrifugação perfeitamente planos, que os dados reais não confirmam; passaram a ter a variação dos reais. A lavagem de 29/10 fica um programa das 09:41 às 11:10 (com a centrifugação, iniciada 2 min depois do fim da lavagem), 0,54 kWh.
- 2026-10-29 — **Um aparelho sozinho ou dois a desligar juntos: ganha o que encaixa melhor.** Um degrau de descida que um aparelho aberto espelha dentro da tolerância (10 %) fechava só esse, mesmo quando a soma de dois encaixava muito melhor (demonstração, 25/10: máquina da loiça 1878 W e frigorífico 109 W a desligar num degrau de −1974 W; sozinha falhava 96 W, os dois 13 W). Passa a fechar o par quando falha menos de metade e o aparelho sozinho falha mais do que um degrau mínimo (30 W): uma chaleira que desliga certa nunca é trocada por um par. Nos dias reais de 26–29/10, as mesmas 10 de 11 anotações encontradas.
