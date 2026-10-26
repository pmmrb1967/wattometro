# Avisos (Web Push)

Os avisos chegam ao telemóvel ou ao computador mesmo com a app fechada. O Cron do Worker (a cada 5 minutos) decide e envia; o service worker da PWA mostra (`public/push-sw.js`).

## Avisos

| Aviso | Quando | Repetição |
|---|---|---|
| O Shelly deixou de enviar | Nenhum dispositivo ativo enviou há `STALE_MINUTES` (15) | Uma vez; outra quando volta |
| Potência perto do corte | Um segundo acima de `k × Sc`: o contador inteligente começa a contar para cortar (`k` = 1,2 em monofásico, `src/data/power-trip.json`, fonte em `docs/contracted-power.md`) | No máximo um por hora |
| Base de dados perto do limite | O D1 já leu 80 % das linhas diárias do plano gratuito | Uma vez por dia UTC |

Escolhido pelo utilizador a 2026-10-26: o limiar de potência é o do contador (120 %), não a potência contratada (100 %). O pico usado é o aparente ao segundo de cada minuto (`apparent_max_va`), ou o ativo quando o minuto não tem valores ao segundo. Cada aparelho escolhe os avisos que quer (Definições → Avisos). Quando o D1 já bloqueou, o próprio Cron não consegue ler e não há avisos: o aviso aos 80 % existe para isso.

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

- ☐ Entrega real num Android (Chrome) e num iPhone com a app no ecrã principal.
- ☐ CPU do Cron no plano gratuito com avisos a enviar (cifra + assinatura por aparelho).
