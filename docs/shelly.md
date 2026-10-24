# Shelly — o que o Wattómetro usa

> **Estado: por confirmar com o aparelho.** Tudo o que está abaixo vem da documentação oficial da Shelly, consultada a **2026-10-22**. Quando o Shelly EM Gen3 chegar, cada ponto marcado com ☐ é confirmado com respostas reais (guardadas em `fixtures/private/`) e esta nota é atualizada.

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
- ☐ **Cada valor é a média do último segundo ou um valor instantâneo?** Determina se os picos de arranque aparecem.
- ☐ **Com que frequência o valor muda?** Teste: ler a 1 s durante 5 min e contar mudanças. Se mudar menos de 1×/s, os valores ao segundo têm repetições.

## Energia — `EM1Data.GetStatus`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/EM1Data>

- `total_act_energy` (Wh) e `total_act_ret_energy` (Wh, energia devolvida). Os totais são gravados na memória flash.
- O Wattómetro calcula a energia do minuto como `floor(total no fim) − floor(total no início)`: cada minuto é inteiro em Wh e a soma dos minutos é exatamente a diferença do contador, sem acumular arredondamentos. Se o contador descer (reposição), o minuto conta só `floor(total)`.
- ☐ Resolução real do contador (casas decimais).

## Hora — `Sys.GetStatus`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Sys/>

- `unixtime`: segundos UTC, **`null` até sincronizar por NTP**. O script não regista nada sem hora.
- `uptime`: "Time in seconds since last reboot". A partir da versão 0.2.0 o script envia `b = unixtime − uptime` (hora do arranque), calculada uma vez; o servidor usa-a para detetar falhas de energia (`docs/voltage.md`).
- `ram_size`, `ram_free`: memória do aparelho.

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
- ☐ Memória disponível para o script (`Script.GetStatus` → `mem_free`, `mem_peak`) com a fila cheia.

## Pedidos HTTP — `HTTP.Request`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/HTTP>

- Parâmetros: `method`, `url`, `body`, `headers` (máx. 15, cada valor até 1024 bytes), `timeout` (s, defeito 15), `ssl_ca`.
- **HTTPS:** com `ssl_ca` omitido usa o `ca.pem` incluído no firmware. ☐ Confirmar que valida o certificado de `app.wattometro.workers.dev`.
- **Tamanho máximo do pedido: 8192 bytes** (URL + cabeçalhos + corpo). O script limita o corpo a 7000 bytes.
- Resposta: `code`, `message`, `headers`, `body`.

## Configuração — `KVS`

Fonte: <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/KVS>

- Chave até 42 caracteres, valor até 253, até 50 chaves.
- Chaves usadas: `wattometro.url`, `wattometro.token`, `wattometro.channel`.

## Por confirmar com o aparelho (lista para a Fase 1.1)

- [ ] Modelo e firmware
- [ ] Resposta real de `EM1.GetStatus`, `EM1Data.GetStatus`, `Sys.GetStatus` → `fixtures/private/`, e equivalentes sintéticas em `fixtures/`
- [ ] Ritmo de atualização e natureza (média vs instantâneo) dos valores ao segundo
- [ ] HTTPS para `app.wattometro.workers.dev` com o `ca.pem` incluído
- [ ] Memória do script com a fila cheia; tamanho real do pedido por minuto
