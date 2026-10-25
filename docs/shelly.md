# Shelly — o que o Wattómetro usa

> **Estado:** o que está abaixo vem da documentação oficial da Shelly, consultada a **2026-10-22**. O Shelly EM Gen3 está a funcionar desde **2026-10-24**: os pontos marcados com ☑ foram confirmados no aparelho (respostas reais em `fixtures/private/`), e os marcados com ☐ ainda estão por confirmar.

## Modelo

- **Shelly EM Gen3** (monofásico, 2 canais de medição, 1 pinça de 50 A incluída; pinça de 120 A opcional). Encomendado em 2026-10-22.
- O Shelly EM de 1.ª geração **não serve**: não corre scripts.
- ☑ Confirmado no aparelho a **2026-10-24** (`Shelly.GetDeviceInfo`): `model` **`S3EM-002CXCEU`**, `gen` 3, `app` `EMG3`, firmware de fábrica `1.6.99` (o próprio aparelho indica a `2.1.0` como versão estável disponível).
- ☑ A pinça de 50 A já vem configurada nos dois canais: `EM1.GetConfig` → `"ct_type": "50AEMG3"`, `"reverse": false`. Não é preciso escolher nada; só muda com a pinça opcional de 120 A.
- `switch:0` é um **contacto seco** (relé sem tensão própria) para comandar um aparelho externo, por exemplo um contactor. Sem nada ligado aos seus terminais, "Ligar"/"Desligar" na app não liga nem desliga nada na casa. Por omissão arranca desligado (`initial_state: "off"`). O Wattómetro não o usa (o corte de potência fica para a Fase 4).

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/Devices/Gen3/ShellyEMG3>

- Componentes: `em1:0`, `em1:1` (medições), `em1data:0`, `em1data:1` (contadores de energia), `switch:0` (contacto seco), até 10 scripts.

## Medições — `EM1.GetStatus`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/EM1>

| Campo | Unidade | Uso no Wattómetro |
|---|---|---|
| `voltage` | V | tensão ao segundo (dV) e mín./méd./máx. por minuto |
| `current` | A | não usado (redundante com `aprt_power`/`voltage`) |
| `act_power` | W | potência ativa ao segundo; méd./mín./máx. por minuto |
| `aprt_power` | VA | potência não ativa ao segundo: `round(sqrt(max(S² − P², 0)))` calculada no script com os valores decimais |
| `pf` | — | não usado ao segundo (resolução insuficiente; ver abaixo); o FP do minuto é `ΣP / ΣS` |
| `freq` | Hz | não usado |
| `errors`, `flags` | — | ☐ a enviar numa versão futura (ex.: `overvoltage`) |

Todos os valores podem ser `null`. Exemplo da documentação: `{"id":0,"voltage":236.1,"current":4.029,"act_power":951.2,"aprt_power":951.9,"pf":1,"freq":50,"calibration":"factory"}`.

- **A potência reativa não vem diretamente.** A grandeza derivada `sqrt(S² − P²)` é a potência *não ativa* (reativa + distorção), **sem sinal**: não distingue cargas indutivas de capacitivas.
- ☑ **Cada valor é uma medição sobre uma janela de ~1 s (média/RMS), não uma amostra instantânea.** Teste de 2026-10-25 (firmware 2.1.0): uma chaleira de ~1600 W ligada e desligada 3 vezes, com `EM1.GetStatus` lido durante 4 min (só ~1 leitura a cada 1–2 s nesse dia). Em 2 das 6 transições apareceu um valor intermédio: ao ligar `act_power` 684 W com `aprt_power` 1249 VA e 5,47 A (antes ~150 W / 1,1 A, depois ~1610 W / 7,1 A); ao desligar 392 W com 1,98 A. Uma amostra instantânea daria um salto limpo; as frações diferentes de P, S e I no mesmo valor mostram que cada grandeza é calculada sobre a janela (P médio, I RMS). Nas outras 4 transições o segundo intermédio caiu entre leituras. Consequência: um pico mais curto do que 1 s (arranque de um motor) aparece diluído na média do segundo; `power_max_w` e `apparent_max_va` são máximos de médias de 1 s, não picos instantâneos.
- ☑ **O valor muda uma vez por segundo**, a meio do segundo do relógio do aparelho: medido a 2026-10-24, firmware 2.1.0, com `EM1.GetStatus` lido ~8×/s durante 60 s. Houve 57 mudanças; o intervalo entre mudanças teve mediana de 1,004 s (p10 0,91 s, p90 1,07 s) e as mudanças caíram entre 0,42 e 0,59 s depois do segundo certo. O script lê a cada segundo, por isso cada valor ao segundo é uma leitura nova (salvo alguma repetição ou falha quando o temporizador e a atualização coincidem).

## Energia — `EM1Data.GetStatus`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/EM1Data>

- `total_act_energy` (Wh) e `total_act_ret_energy` (Wh, energia devolvida). Os totais são gravados na memória flash.
- O Wattómetro calcula a energia do minuto como `floor(total no fim) − floor(total no início)`: cada minuto é inteiro em Wh e a soma dos minutos é exatamente a diferença do contador, sem acumular arredondamentos. Se o contador descer (reposição), o minuto conta só `floor(total)`.
- ☑ Resolução: duas casas decimais (ex.: `467.01`).
- ☑ **O total só muda uma vez por minuto**, cerca de **1,2 s depois** do minuto certo do relógio do aparelho (medido a 2026-10-24, firmware 2.1.0: lido a cada 0,5 s, mudou às hh:mm:01,2–01,3). Com o script 0.2.0, que lia o total ao segundo :00, a leitura apanhava às vezes o valor antes da mudança e às vezes depois, e a energia saltava entre minutos (0, 12 e 6 Wh a ~345 W constantes). O total do dia estava certo, mas o de cada minuto não. A partir do **0.2.1**, o script fecha o minuto ao :00 e só lê a energia dele 5 s depois (`COUNTER_SETTLE`).

## Registo interno — `EM1Data.GetRecords` / `GetData`

Fontes, consultadas a 2026-10-25:
- <https://kb.shelly.cloud/knowledge-base/shelly-em-gen3>: "Data logs stored on device for up to 10 days of minute data records" (características) e "At least 10 days of 1 min data resolution" (especificações); "JSON format export through RPC"; flash de 8 MB.
- <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/EM1Data>: `GetRecords {id, ts}` lista os blocos guardados (`ts`, `period`, `records`); `GetData {id, ts, end_ts}` devolve os registos por partes (`keys`, `data[{ts, period, values}]`, `next_record_ts` quando há mais); CSV em `http://<ip>/em1data/<id>/data.csv?ts&end_ts`. A API não diz quanto tempo fica guardado.

Visto no aparelho a 2026-10-25 (firmware 2.1.0):
- ☑ Um registo por minuto (`period` 60) e por canal, guardado pelo próprio Shelly, mesmo sem script e sem internet. Desde a instalação (24/10, 14:38 UTC) estão lá todos os minutos.
- ☑ Chaves: `total_act_energy` (Wh do minuto, 4 casas decimais), `total_act_ret_energy`, `lag_react_energy`, `lead_react_energy`, `max/min_act_power` (W), `max/min_aprt_power` (VA), `max/min/avg_voltage` (V), `max/min/avg_current` (A).
- ☑ Não tem os valores ao segundo nem o fator de potência; o Wattómetro estima-o com `P / (V × I)` médios.
- ☑ Cada `GetData` devolve ~28 minutos: 10 dias são ~500 pedidos.
- ☑ Os minutos em que o relógio do Shelly estava errado (noite de 24 para 25/10) também faltam no registo.
- ☐ Quantos dias cabem de facto: confirmar ao fim de 10 dias com `GetRecords` (o registo mais antigo).

Uso: `pnpm shelly:backfill` (`scripts/shelly-backfill.ts`) preenche, a partir do PC em casa, os minutos que o servidor não tem (`GET /v1/ingest/missing`), sem valores ao segundo e com o pico aparente em `sx`. Cobre falhas do D1 ou da internet até ~10 dias; a fila em RAM do script só cobre ~30 min.

## Hora — `Sys.GetStatus`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Sys/>

- `unixtime`: segundos UTC, **`null` até sincronizar por NTP**. O script não regista nada sem hora.
- `uptime`: "Time in seconds since last reboot". A partir da versão 0.2.0 o script envia `b = unixtime − uptime` (hora do arranque), calculada uma vez; o servidor usa-a para detetar falhas de energia (`docs/voltage.md`).
- `ram_size`, `ram_free`: memória do aparelho.
- **Mudança da hora (2026-10-25, firmware 2.1.0):** entre as 00:00 e as 02:04 UTC (a hora repetida, 01:00–02:00 em Lisboa, duas vezes) chegaram só 4 dos ~124 minutos, sem reinício e com o script sempre a correr. A explicação mais provável, por confirmar em março: durante a hora ambígua o `unixtime` ficou uma hora adiantado e o servidor descartou os minutos como "do futuro" (tolerância de 120 s, `server/src/ingest.ts`). A partir do script 0.3.2, cada resposta de `/v1/ingest` leva a hora do servidor (`now`); se o relógio do Shelly estiver desviado mais de 60 s, o script soma o desvio até o relógio do aparelho saltar (acertou-se sozinho) ou a resposta seguinte dizer que já está certo. Também escreve na consola os minutos rejeitados pelo servidor. A verificar em 2026-03-29 (hora de verão).

## Scripts

Fontes:
- <https://shelly-api-docs.shelly.cloud/gen2/Scripts/APIs/Shelly/>
- <https://shelly-api-docs.shelly.cloud/gen2/Scripts/APIs/Timer/>
- <https://shelly-api-docs.shelly.cloud/gen2/0.14/Scripts/ShellyScriptLanguageFeatures/> (limites; a página da versão atual não abriu na consulta)
- <https://shelly-forum.com/thread/23294-too-many-calls-in-progress/>

- `Shelly.getComponentStatus(tipo, id)` lê o estado sem gastar um pedido RPC; `Shelly.call(método, params, callback)` faz pedidos RPC.
- `Timer.set(período_ms, repetir, callback)`.
- **Limites por script:** 5 temporizadores, 5 subscrições de eventos, 5 de estado, **5 pedidos RPC em curso** (exceder aborta o script).
- O interpretador atual (firmware 1.x) é baseado em Espruino; sem classes ES6, sem promessas/async, sem *hoisting*. O script usa JavaScript conservador.
- ☑ **Memória de um script: ~25 KB no total** (`mem_free` = 25 200 com o script parado; EM Gen3, firmware 2.1.0, 2026-10-24). Com a fila vazia, o script usa ~7 KB. Cada minuto na fila ocupa ~1,2 KB com os valores ao segundo e ~0,3 KB só com o resumo. **Um envio precisa, no pico, de ~3,3 KB mais 4 × o tamanho do corpo** (picos de 15,5, 20,3 e 24,7 KB com envios de 1, 2 e 3 minutos).
- ☑ Com o script 0.2.1, um corte de internet simulado esgotou a memória ao fim de ~6 minutos: na tentativa de enviar 4 minutos de uma vez, o script parou (`"errors":["out_of_memory"]`) e só voltaria a correr com um reinício. A proteção por memória livre não atuou, porque o pico acontece só durante o envio.
- ☑ **Script 0.3.0:** cada envio é dimensionado à memória livre nesse momento (`(mem_free − 6000) / 4` bytes, no máximo 2200); abaixo de 8000 bytes livres descartam-se primeiro os valores ao segundo dos minutos mais antigos e depois os minutos mais antigos. Num corte simulado de 25 minutos no aparelho, o pico foi de 21,3 KB, a memória livre nunca baixou de 7,9 KB, e os 25 minutos chegaram ao servidor em 4 envios, 15 s depois de a ligação voltar (só o último manteve os valores ao segundo). Cabem ~30 minutos de corte sem perder minutos; num corte mais longo perdem-se os mais antigos (a E-Redes continua a ter a energia para a fatura).
- ☑ **Rede de segurança:** `pnpm shelly:install` cria um agendamento (`Schedule.Create`, `"0 */5 * * * *"`) que chama `Script.Start` a cada 5 minutos. Arrancar um script que já corre não o reinicia (`{"was_running": true}`), por isso só tem efeito se o script tiver parado. Os testes (`shelly/wattometro.test.ts`) simulam este modelo de memória e falham se o script passar dos 25,2 KB.

Fonte do agendamento: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Schedule> (cron com segundos; até 20 agendamentos e 5 chamadas por agendamento).

## Pedidos HTTP — `HTTP.Request`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/HTTP>

- Parâmetros: `method`, `url`, `body`, `headers` (máx. 15, cada valor até 1024 bytes), `timeout` (s, defeito 15), `ssl_ca`.
- **HTTPS:** com `ssl_ca` omitido usa o `ca.pem` incluído no firmware. ☑ Funciona com `app.wattometro.workers.dev` (envios desde 2026-10-24).
- **Tamanho máximo do pedido: 8192 bytes** (URL + cabeçalhos + corpo). Por causa da memória (ver "Scripts"), o script 0.3.0 limita o corpo a 2200 bytes. ☑ Tamanhos reais: ~975–1040 bytes para um minuto com os valores ao segundo; ~100 bytes por minuto só com o resumo (mais ~80 do cabeçalho do pedido).
- Resposta: `code`, `message`, `headers`, `body`.

## Configuração — `KVS`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/KVS>

- Chave até 42 caracteres, valor até 253, até 50 chaves.
- Chaves usadas: `wattometro.url`, `wattometro.token`, `wattometro.channel`.
- **No EM Gen3 (firmware 2.1.0) o KVS esvazia-se em cada reinício** — medido a 2026-10-25: depois de uma falha de luz, e outra vez com `Shelly.Reboot`, `KVS.GetMany` respondeu `{"items":[],"total":0}`, embora `kvs_rev` em `Sys.GetStatus` se mantivesse (9). O código dos scripts e os agendamentos sobrevivem. Não encontrei este comportamento descrito na documentação nem em relatos públicos; a causa não está confirmada.
- Consequência: o script 0.3.0 arrancou sem URL nem token e não enviou nada durante 2 h (perdeu 129 minutos, das 21:47 às 23:57 de 2026-10-24). A partir do 0.3.1, `pnpm shelly:install` escreve também o URL e o token na cópia do script que envia para o Shelly (`INSTALLED`, `scripts/shelly/embed.ts`; vazio no repositório), usada quando o KVS não os tem. Verificado com um reinício: voltou a enviar sozinho.

## Autenticação (palavra-passe local)

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/General/Authentication> (consultada a 2026-10-24).

- Define-se na página web do Shelly, em **Settings → Authentication** ("Enable password protected device"); o utilizador é sempre `admin`. Confirmado no aparelho (firmware 2.1.0). Não protege o script nem os envios para o Wattómetro, só o acesso pela rede local.
- Os pedidos sem autenticação recebem **401** com `WWW-Authenticate: Digest qop="auth", realm="<id do aparelho>", nonce="<base64>", algorithm=SHA-256`.
- Por RPC, o pedido repete-se com um objeto `auth`: `realm`, `username: "admin"`, `nonce` (texto desde o firmware 2.0.0; número antes), `cnonce` (número aleatório), `nc` (`"00000001"`), `algorithm: "SHA-256"` e `response = SHA256(ha1:nonce:nc:cnonce:auth:ha2)`, com `ha1 = SHA256(admin:realm:password)` e `ha2 = SHA256(dummy_method:dummy_uri)`.
- O `curl` do Git para Windows (Schannel) não consegue fazer este digest SHA-256: `scripts/shelly/rpc.ts` faz-o em Node. `pnpm shelly:install` lê `SHELLY_HOST` e `SHELLY_PASSWORD` do `.env` (ver `.env.example`).

## Por confirmar com o aparelho (lista para a Fase 1.1)

- [x] Modelo e firmware
- [x] Resposta real de `EM1.GetStatus`, `EM1Data.GetStatus`, `Sys.GetStatus` → `fixtures/private/`, e equivalentes sintéticas em `fixtures/shelly/`
- [x] Ritmo de atualização dos valores ao segundo
- [x] Natureza (média vs instantâneo) dos valores ao segundo: média de ~1 s (2026-10-25)
- [x] HTTPS para `app.wattometro.workers.dev` com o `ca.pem` incluído
- [x] Memória do script com a fila cheia; tamanho real do pedido por minuto
