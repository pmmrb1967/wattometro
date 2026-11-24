# Avisos (Web Push)

Os avisos chegam ao telemóvel ou ao computador mesmo com a app fechada. O Cron do Worker (a cada 5 minutos) decide e envia; o service worker da PWA mostra (`public/push-sw.js`).

## Avisos

| Aviso | Quando | Repetição |
|---|---|---|
| O Shelly deixou de enviar | Nenhum dispositivo ativo enviou há `STALE_MINUTES` (15) | Uma vez; outra quando volta |
| Potência perto do corte | Um segundo acima de `k × Sc`: o contador inteligente começa a contar para cortar (`k` = 1,2 em monofásico, `src/data/power-trip.json`, fonte em `docs/contracted-power.md`). Cada aparelho pode escolher avisar já a partir de 1,0 × a potência contratada ("Potência acima da contratada"; migração 0034) | No máximo um por hora |
| Com outro escalão, a luz teria ido abaixo | Para escolher a potência a contratar: o aparelho escolhe um escalão qualquer (`src/data/power-tiers.json`; por omissão o abaixo do contratado) e o Cron aplica aos valores ao segundo do Shelly a curva de corte do contador com esse escalão (`nearTripEpisodes`, `src/domain/contracted-power.ts`, sem margem). Avisa quando teria cortado. Revê os últimos 30 minutos em cada execução, para apanhar sobrecargas entre execuções; um minuto sem valores ao segundo não conta (o pico durante 60 s exageraria). Desligado por omissão | No máximo um por hora |
| Base de dados perto do limite | O D1 já leu 80 % das linhas diárias do plano gratuito; abre Definições → Servidor (`docs/admin.md`) | Uma vez por dia UTC |
| Horas mais baratas de amanhã | Saem os preços OMIE do dia seguinte (a partir das 12:00 de Lisboa): as 3 horas seguidas mais baratas e as mais caras (`docs/omie.md`). Desligado por omissão: só conta num tarifário com preço à hora | Uma vez por dia |
| Importar a E-Redes | O último dia importado da E-Redes tem mais de 31 dias. Desligado por omissão | No máximo uma vez por mês |
| Rever o tarifário | Em janeiro e em julho. Desligado por omissão | Uma vez em cada um desses meses |
| Orçamento do mês | A partir do dia 7, a energia do mês ao ritmo até agora passa a que o orçamento compra. Desligado por omissão | Uma vez por mês |
| Ontem, fora do habitual | Ontem a casa gastou muito mais (ou muito menos) do que é costume nesse tipo de dia: o mesmo teste da app (`judgeDay`, `src/ml/anomalies.ts`) sobre os totais diários. Só nas casas que disseram que a temperatura não conta (aquecimento não elétrico e sem ar condicionado). Desligado por omissão | Uma vez por dia anómalo |
| É altura de guardar uma cópia da casa | A última cópia da casa feita na app passou do prazo escolhido em Definições › Dados e Shelly (7 dias por omissão, 15, 1 mês ou nunca), ou ainda não há nenhuma (`docs/backup.md`; migração 0033, que reaproveita o aviso `backup` da 0032). Desligado por omissão | De manhã; de novo uma semana depois enquanto durar |

### O que estava ligado no pico

Os dois avisos de potência acrescentam ao texto o que provavelmente estava ligado no segundo do pico e o que desligar para ficar abaixo do limite **desse** aviso: a potência contratada (1,0 ×), 1,2 × a contratada, ou 1,2 × o escalão simulado (abaixo disso o contador não conta para cortar). Por exemplo: "Nesse segundo estava ligado, provavelmente: forno 2,50 kW, algo de 3,00 kW ligado às 17:48; o resto da casa, 2,00 kW. Desligar o forno baixava para cerca de 5 kVA, abaixo de 6,9 kVA."

- Só quando o aviso é enviado (no máximo um por hora): o Cron lê os valores ao segundo das 2 horas antes do pico até ao último minuto (cerca de 150 linhas de `readings_1s`) e os aparelhos com nome.
- Os degraus emparelham-se como em "Ao segundo" (`src/nilm/cycles.ts`, `pairSteps`); um aparelho que ainda não desligou nomeia-se só pela potência (com dois candidatos, os dois: "máquina de lavar roupa ou máquina de lavar loiça"). O que os degraus não explicam (ligado antes da janela, os sempre ligados, aparelhos abaixo de 200 W) é "o resto da casa".
- O que desligar: o mais pequeno que chega sozinho, senão os maiores, até três (`switchOff`, `src/nilm/at-peak.ts`). A potência aparente sem eles calcula-se com a ativa e a não ativa de cada um; é uma estimativa ("cerca de").
- Sem valores ao segundo (minutos antigos, outro formato), o aviso segue sem esta parte.
- Custo: cerca de 3 ms de CPU num caso com muitos degraus, medido num PC.


Escolhido pelo utilizador a 2026-10-26: o limiar de potência é o do contador (120 %), não a potência contratada (100 %). O pico usado é o aparente ao segundo de cada minuto (`apparent_max_va`), ou o ativo quando o minuto não tem valores ao segundo. Cada aparelho escolhe os avisos que quer (Definições → Avisos). Quando o D1 já bloqueou, o próprio Cron não consegue ler e não há avisos: o aviso aos 80 % existe para isso.

Os três lembretes (migração 0020) só se veem uma vez por dia de Lisboa, a partir das 10:00 (`checked_until` guarda o dia), para não lerem o D1 a cada 5 minutos. O orçamento guarda-se em euros e na **energia por dia** que compra (`household_budget`): o browser faz a conta com o tarifário e a repartição do mês por períodos (`src/domain/budget.ts`), e o Cron só compara kWh, com o contador com mais energia no mês (a E-Redes chega atrasada; um circuito tem menos). O aviso de dia fora do habitual (migração 0023) corre com os lembretes, uma vez por dia a partir das 10:00. Lê os totais diários de `daily` das últimas 12 semanas (algumas centenas de linhas por dia) e monta a série da casa como a app: o Shelly com mais energia quando tem o dia inteiro (falta no máximo 1 h), senão a E-Redes. O teste é o da app, com o mesmo código (mediana e MAD dos 12 dias mais recentes do mesmo tipo, limiar 3,5), mas sem as horas: o aviso diz quanto e manda abrir Consumo para ver a que horas. Não usa a temperatura, porque o Worker não pede o tempo à Open-Meteo; por isso só avisa nas casas cuja eletricidade não depende do tempo (`followsTemperature`), onde a app também não a usa. Escolhido pelo utilizador a 2026-10-29 (em vez de correr o cálculo completo sobre os quartos de hora no Cron: ~8 000 linhas lidas por dia e CPU perto do limite).

O lembrete do tarifário é tão útil quanto as ofertas da app: `public/data/erse-offers.json` atualiza-se com `pnpm erse:sync`.

## Como funciona

- O browser subscreve com a chave pública VAPID do servidor (`GET /v1/push/key`) e envia o `endpoint` e as suas chaves (`PUT /v1/push/subscription`; tabela `push_subscriptions`, migração 0015).
- O Worker cifra cada mensagem para esse browser (aes128gcm) e assina o pedido com a chave privada VAPID; o serviço de push entrega sem conseguir ler. Implementado só com WebCrypto em `server/src/webpush.ts`, testado com os valores do RFC 8291 (Apêndice A).
- Só se aceitam `endpoint`s dos serviços de push dos browsers (`isPushEndpoint`): Google (`fcm.googleapis.com`), Apple (`*.push.apple.com`), Mozilla (`updates.push.services.mozilla.com`) e Microsoft (`*.notify.windows.com`). O Worker não faz pedidos para mais lado nenhum.
- Uma resposta 404/410 do serviço de push apaga a subscrição (o browser cancelou-a).
- `alert_state` guarda, por casa e aviso, se a condição está ativa, até onde se viram os minutos e quando se avisou: uma condição que se mantém só é anunciada uma vez.

## Privacidade (regra 1 do CLAUDE.md)

Os serviços de push são uma ligação externa aceite pelo utilizador a 2026-10-26, só para avisos: a mensagem vai cifrada de ponta a ponta (só o aparelho a decifra) e leva apenas o título e o texto do aviso, nunca séries de medições. O serviço vê que houve uma mensagem para aquele aparelho, quando e o tamanho.

## Configuração

- `VAPID_PUBLIC_KEY` (variável em `server/wrangler.toml`; é pública) e `VAPID_PRIVATE_KEY` (`wrangler secret put VAPID_PRIVATE_KEY`; o escalar `d` em base64url). Sem elas, `/v1/push/*` responde 503 e o Cron não envia.
- `VAPID_SUBJECT`: o contacto para os serviços de push (`mailto:wattometro@outlook.com`).
- Gerar um par: `node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(async k=>{const j=await crypto.subtle.exportKey('jwk',k.privateKey);const r=Buffer.from(await crypto.subtle.exportKey('raw',k.publicKey)).toString('base64url');console.log(r);process.stderr.write(j.d)})"` (a pública sai no stdout; a privada no stderr, para ir direta para `wrangler secret put`). Trocar o par obriga cada aparelho a ativar os avisos outra vez.

## Fontes (consultadas a 2026-10-26)

- RFC 8030, Generic Event Delivery Using HTTP Push: <https://www.rfc-editor.org/rfc/rfc8030>
- RFC 8291, Message Encryption for Web Push: <https://www.rfc-editor.org/rfc/rfc8291>
- RFC 8292, VAPID: <https://www.rfc-editor.org/rfc/rfc8292>
- iPhone e iPad: Web Push só para web apps adicionadas ao ecrã principal (iOS/iPadOS 16.4 ou posterior): <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers>

## Por confirmar

- ☑ Entrega real num Android (Chrome, serviço da Google), a 2026-10-26: o aviso de teste chegou como notificação do sistema.
- ☐ Entrega real num iPhone com a app no ecrã principal.
- ☐ CPU do Cron no plano gratuito com avisos a enviar (cifra + assinatura por aparelho).
