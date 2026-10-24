# Instalar o script do Wattómetro no Shelly

> **Estado:** a correr num Shelly EM Gen3 (firmware 2.1.0) desde 2026-10-24. Também é testado num Shelly simulado (`shelly/wattometro.test.ts`) contra o servidor verdadeiro. Os pontos ainda por confirmar estão em `docs/shelly.md`.

Funciona com Shelly de 2.ª geração ou mais recente que meça energia, por exemplo o **Shelly EM Gen3**. O Shelly EM de 1.ª geração não corre scripts.

## O que o script faz

- Lê o Shelly **a cada segundo** (potência ativa, potência não ativa, tensão).
- Ao fim de cada minuto envia para o Wattómetro o resumo do minuto e os 60 valores ao segundo.
- Se a internet falhar, guarda os minutos em memória e envia-os quando a ligação voltar. A memória de um script é pequena (~25 KB): cabem cerca de 30 minutos de corte sem perder minutos. Se a memória apertar, descarta primeiro os valores ao segundo dos minutos mais antigos e depois os minutos mais antigos.
- **Não decide nada sozinho:** só recolhe e envia. A análise faz-se na app.

## 1. Preparar o Shelly

1. Instala o Shelly no quadro (fase, neutro e a pinça no cabo de entrada da casa). Se não estiveres à vontade com o quadro, pede a um eletricista.
2. Liga-o ao Wi-Fi com a app **Shelly Smart Control** e atualiza o firmware.
3. A pinça de 50 A que vem com o Shelly EM Gen3 já está configurada de fábrica, por isso não há nada a escolher. Para confirmar, abre `http://IP/rpc/EM1.GetConfig?id=0`: deve mostrar `"ct_type":"50AEMG3"`. Só é preciso mudar com a pinça opcional de 120 A.
4. Descobre o endereço IP do Shelly na rede de casa (na app: Definições do dispositivo → Informação do dispositivo). Nos passos seguintes é `IP`.

## 2. Criar o token no Wattómetro

1. Em <https://app.wattometro.workers.dev/definicoes> → **Dispositivos**, escreve um nome (ex.: "Quadro") e carrega em **Adicionar dispositivo**.
2. Copia o **Endereço** e o **Token**. O token só aparece desta vez: se o perderes, remove o dispositivo e cria outro.

## 3. Guardar a configuração no Shelly

> **Importante (EM Gen3, firmware 2.1.0):** o Shelly esquece esta configuração sempre que reinicia, por exemplo numa falha de luz (`docs/shelly.md`, «KVS»). Para não depender dela, usa `pnpm shelly:install` com `SHELLY_INGEST_URL` e `SHELLY_DEVICE_TOKEN` no `.env`: o endereço e o token ficam gravados no próprio script, que sobrevive aos reinícios.

No browser de um computador ou telemóvel **ligado à mesma rede Wi-Fi**, abre estes três endereços, um de cada vez (troca `IP` e `TOKEN`; mantém as aspas). Cada um deve responder com algo como `{"etag":"…"}`.

```
http://IP/rpc/KVS.Set?key="wattometro.url"&value="https://app.wattometro.workers.dev/v1/ingest"
http://IP/rpc/KVS.Set?key="wattometro.token"&value="TOKEN"
http://IP/rpc/KVS.Set?key="wattometro.channel"&value="0"
```

O canal é `0` para a pinça incluída; `1` só se a pinça estiver no segundo canal.

O token fica no histórico desse browser: apaga-o no fim, ou usa uma janela privada.

## 4. Instalar o script

1. Abre `http://IP` no browser (a interface web do Shelly).
2. Vai a **Scripts** → **Create script**, chama-lhe `wattometro`.
3. Cola o conteúdo de [`wattometro.js`](wattometro.js) e guarda.
4. Carrega em **Start** e ativa **Run on startup** (para arrancar sozinho depois de um corte de luz).

Com um computador e o repositório, `pnpm shelly:install` faz estes passos (ver «Atualizar o script») e cria também um agendamento no Shelly que volta a arrancar o script a cada 5 minutos, se tiver parado.

## 5. Confirmar

- Na consola do script deve aparecer `wattometro 0.3.1 channel 0 …`. Se aparecer `set wattometro.url and wattometro.token in KVS`, repete o passo 3 e reinicia o script.
- Ao fim de 1–2 minutos, em **Definições → Dispositivos** no Wattómetro, o dispositivo mostra **Último envio** com a hora.
- Mensagens `send failed` ou `server answered 401` indicam falta de internet ou token errado.

## Mudar a configuração

Repete o passo 3 com o valor novo e depois **Stop** e **Start** no script. Um token novo exige criar outro dispositivo no Wattómetro (o antigo pode ser removido).

## Atualizar o script

A partir de um computador na mesma rede, com o repositório: copia `.env.example` para `.env`, preenche `SHELLY_HOST` (e `SHELLY_PASSWORD`, se o Shelly tiver palavra-passe), `SHELLY_INGEST_URL` e `SHELLY_DEVICE_TOKEN` (o token do dispositivo; fica só no `.env` e no Shelly) e corre `pnpm shelly:install`. O comando cria o script se faltar, envia o código, ativa o arranque automático, reinicia-o e confirma que o código no Shelly é igual ao do repositório. Se já for igual, não mexe em nada.

Sem o repositório: substitui o conteúdo do script pela versão nova de `wattometro.js`, guarda e reinicia.

Em ambos os casos a configuração (passo 3) mantém-se. O servidor aceita as versões anteriores do formato de envio.
