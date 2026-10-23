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
- [ ] **Confirmar modelo do Shelly** (ex.: EM Gen3, Pro EM-50) e firmware; registar em `docs/shelly.md` — EM Gen3 encomendado; `docs/shelly.md` escrito a partir da documentação oficial, falta confirmar com o aparelho
- [ ] Capturar respostas reais de `EM1.GetStatus`/`EM.GetStatus` e `EM1Data`/`EMData` → `fixtures/private/`; criar equivalentes sintéticas
- [ ] Confirmar suporte de scripts, `Timer`, `HTTP.POST` com HTTPS e limites de memória do script
- [ ] Confirmar **como o script obtém medições a cada segundo** (handler de estado vs `Timer` a 1 s com `EM1.GetStatus`) e **que grandezas existem ao segundo** (potência ativa, aparente, FP; potência reativa direta ou derivada)
- [ ] Medir o tamanho real do pedido por minuto (agregado + arrays) e confirmar que o Shelly o envia sem problemas

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
- [x] Teste do script num Shelly simulado contra o servidor real (`shelly/wattometro.test.ts`), incluindo 30 min sem internet
- [ ] Correr o script num Shelly real (quando chegar)

### 1.4 Agregações (Cron)
- [x] Migrações `readings_15m`, `daily` (`0004_rollups.sql`; por contador `meter`; períodos horários e consumo base no `daily` ficam para a Fase 3)
- [x] `rollups.ts`: `INSERT … SELECT` incremental 1 min → 15 min → dia; marca de "último processado" (Cron a cada 5 min; recalcula as últimas 6 h para os minutos atrasados)
- [x] Purga de `readings_1m` e `readings_1s` conforme retenção (por defeito 24 meses e 90 dias); nunca purgar minutos referenciados em `signatures` (as assinaturas da Fase 8 são cópias, por isso a purga não lhes toca)
- [x] Monitorização do tamanho da base (alerta na app a partir de 80 % dos 500 MB)

### 1.5 App
- [x] Página "Agora": último minuto (potência, tensão), energia de hoje, pico de hoje, estado do Shelly (último envio)
- [x] Custo provisório de hoje (tarifário em Definições; motor de custos da Fase 3.2)
- [ ] Gráficos dia/semana/mês e mapa de calor hora × dia da semana

**Aceitação:** 7 dias de dados sem perdas relevantes; um corte de internet de 30 min é recuperado sem buracos.

---

## Fase 2 — Importação E-Redes

- [x] **Obter um ficheiro real** do Balcão Digital → `fixtures/private/` (é `.xlsx`, não CSV); formato em `docs/eredes-csv.md`; fixture sintética (`src/import/eredes-fixture.ts`)
- [x] Parser no browser (`src/import/eredes.ts`): `.xlsx` com `fflate`, kW por quarto de hora → Wh, vírgula decimal, estado real/estimado
- [x] Convenção início/fim do intervalo confirmada (a hora marca o **fim**) e aplicada em `src/lib/time.ts` (`eredesQuarterStart`)
- [x] `POST /v1/import/eredes` (lotes de 15 min, idempotente, origem `eredes`, marca de estimado; migração 0009) e secção em Definições
- [ ] Reconciliação Shelly vs E-Redes nos períodos sobrepostos (diferença em %; mostrar ao utilizador)
- [ ] Regra de prioridade por período (por defeito: E-Redes é a referência de faturação; Shelly para detalhe)

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
- [ ] Validação contra 2–3 faturas reais (em `fixtures/private/`); definir margem aceitável — 1 fatura Repsol: a menos de 2 cêntimos com os preços, e a menos de 1 % com a energia do ficheiro da E-Redes (testes `*.real`, só locais); faltam mais faturas (IVA do IEC: 23 %, pela ERSE)
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
- [ ] Gerado no browser: consumo, custo, comparação com mês anterior e homólogo, consumo base, potência máxima, sugestões determinísticas

**Aceitação:** a app indica o tarifário e a potência mais baratos e quanto se poupa; o custo calculado bate com as faturas dentro da margem definida.

---

## Fase 4 — Alertas

- [ ] Script do Shelly: alerta quando a potência se aproxima da contratada (limiar em `KVS`)
- [ ] Corte local de carga adiável (saída do Shelly ou outro Shelly de relé na rede) — desligado por defeito, com confirmação nas definições
- [ ] Web Push a partir do Worker (chaves VAPID como secrets) para: limite de potência, Shelly sem enviar há N minutos, anomalias (Fase 6)
- [ ] Supressão de alertas repetidos

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

- [ ] Open-Meteo: histórico e previsão para a localização da casa; cache em Dexie
- [ ] Previsão da fatura do mês: regressão com consumo até à data, dia da semana, feriados, temperatura; baseline ingénua para comparação; backtest
- [ ] Anomalias: perfil esperado hora × dia da semana × temperatura; desvio com limiar estatístico
- [ ] Saúde de aparelhos (com Fase 8): duty cycle do frigorífico vs temperatura exterior; duração dos ciclos do termoacumulador

**Aceitação:** previsão melhor que a baseline no backtest; anomalias plantadas são detetadas.

---

## Fase 7 — IA (opcional)

- [ ] Copiar do Faturómetro a abstração `src/ai/` (provider, estimativa de custo, sessão)
- [ ] Ferramentas executadas no browser (ver `CLAUDE.md`), com contratos zod e respostas pequenas
- [ ] Chat "Pergunta ao Wattómetro"
- [ ] Relatório mensal narrado sobre números já calculados
- [ ] Alertas explicados em linguagem simples
- [ ] `pnpm ai:eval`: perguntas com respostas esperadas; os números têm de bater com o motor de cálculo

**Aceitação:** "quanto gastei em setembro?" e "compensa-me o bi-horário?" respondidos com números idênticos aos da app.

---

## Fase 8 — NILM (no browser, sobre os dados ao segundo)

Toda a lógica corre em `src/nilm/`, sobre `readings_1s`. Pode ser melhorada e reprocessada sobre os últimos 90 dias sem tocar no Shelly.

### 8.1 Deteção de eventos
- [ ] Deteção de saltos de potência (ΔP, e ΔQ quando houver) com filtragem de ruído e estados estáveis antes/depois
- [ ] Descritor de cada evento ao segundo: ΔP, ΔQ/ΔFP, pico de arranque (overshoot) e duração do transitório, rampa (aparelhos com inversor), estabilidade do estado seguinte
- [ ] Emparelhamento liga/desliga → ciclos com duração e energia; aparelhos multi-estado (ex.: fases da máquina de lavar)
- [ ] Padrões periódicos de segundos (ex.: placa de indução a pulsar)
- [ ] Migração `events` (resultado sincronizado) e reprocessamento idempotente por intervalo de datas

### 8.2 Modo de calibração
- [ ] Ecrã "Calibrar": o utilizador indica o aparelho, liga-o e desliga-o com a app aberta
- [ ] Os minutos correspondentes são copiados para `signatures` (sem expiração) com o rótulo
- [ ] Biblioteca de assinaturas da casa, usada para classificar eventos futuros e passados

### 8.3 Agrupamento e rotulagem
- [ ] Agrupamento de eventos por descritor (ΔP, transitório, duração, hora do dia)
- [ ] Rotulagem: "Detetei isto — o que é?" com exemplos do grupo; rótulo propaga-se ao grupo
- [ ] Classificação de eventos novos contra a biblioteca de assinaturas e os grupos rotulados

### 8.4 Resultados
- [ ] Energia e custo por aparelho rotulado; percentagem da energia explicada (métrica honesta)
- [ ] Ciclos por aparelho para a saúde de aparelhos (Fase 6): duty cycle do frigorífico, duração do aquecimento do termoacumulador

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
