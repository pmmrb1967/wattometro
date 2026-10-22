# Instalar o script do Wattómetro no Shelly

> **Estado:** o script ainda não correu num Shelly real. Foi testado num Shelly simulado (`shelly/wattometro.test.ts`) contra o servidor verdadeiro. Os pontos por confirmar estão em `docs/shelly.md`.

Funciona com Shelly de 2.ª geração ou mais recente que meça energia, por exemplo o **Shelly EM Gen3**. O Shelly EM de 1.ª geração não corre scripts.

## O que o script faz

- Lê o Shelly **a cada segundo** (potência ativa, potência não ativa, tensão).
- Ao fim de cada minuto envia para o Wattómetro o resumo do minuto e os 60 valores ao segundo.
- Se a internet falhar, guarda os minutos em memória (até 4 horas de resumos) e envia-os quando a ligação voltar. Se a memória apertar, descarta primeiro os valores ao segundo dos minutos mais antigos.
- **Não decide nada sozinho:** só recolhe e envia. A análise faz-se na app.

## 1. Preparar o Shelly

1. Instala o Shelly no quadro (fase, neutro e a pinça no cabo de entrada da casa). Se não estiveres à vontade com o quadro, pede a um eletricista.
2. Liga-o ao Wi-Fi com a app **Shelly Smart Control** e atualiza o firmware.
3. Na app, configura o **tipo de pinça** do canal 0 (50 A, a que vem com o aparelho).
4. Descobre o endereço IP do Shelly na rede de casa (na app: Definições do dispositivo → Informação do dispositivo). Nos passos seguintes é `IP`.

## 2. Criar o token no Wattómetro

1. Em <https://app.wattometro.workers.dev/definicoes> → **Dispositivos**, escreve um nome (ex.: "Quadro") e carrega em **Adicionar dispositivo**.
2. Copia o **Endereço** e o **Token**. O token só aparece desta vez: se o perderes, remove o dispositivo e cria outro.

## 3. Guardar a configuração no Shelly

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

## 5. Confirmar

- Na consola do script deve aparecer `wattometro 0.1.0 channel 0 …`. Se aparecer `set wattometro.url and wattometro.token in KVS`, repete o passo 3 e reinicia o script.
- Ao fim de 1–2 minutos, em **Definições → Dispositivos** no Wattómetro, o dispositivo mostra **Último envio** com a hora.
- Mensagens `send failed` ou `server answered 401` indicam falta de internet ou token errado.

## Mudar a configuração

Repete o passo 3 com o valor novo e depois **Stop** e **Start** no script. Um token novo exige criar outro dispositivo no Wattómetro (o antigo pode ser removido).

## Atualizar o script

Substitui o conteúdo do script pela versão nova de `wattometro.js`, guarda e reinicia. A configuração (passo 3) mantém-se. O servidor aceita as versões anteriores do formato de envio.
