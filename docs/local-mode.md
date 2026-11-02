# Modo sem conta (local)

Para quem só tem o ficheiro da E-Redes e não quer conta: na página de entrada, "Usar sem conta". Decidido a 2026-10-29 (`planning/plan.md`, Decisões; capacidade e alternativas em `docs/hosting.md`).

## Como funciona

- **A casa fica neste browser.** Uma base IndexedDB própria (`wattometro-local`, `src/local/store.ts`) guarda um só registo: os quartos de hora da E-Redes, os tarifários, a zona de qualidade, a localidade, o orçamento, a instalação e a lista do que está sempre ligado (`src/local/data.ts`). É separada das caches: "Sair" não a apaga.
- **Nada vai para o servidor.** `src/local/server.ts` responde no browser às mesmas rotas `/v1/...` que o Worker, com as mesmas formas de resposta, para uma casa sem Shelly (como a demonstração, `src/demo/server.ts`). As páginas e `src/app/api.ts` não mudam.
- **Volta sozinho.** O modo fica marcado neste browser (`localStorage`); ao abrir a app outra vez, entra nele.
- **Armazenamento persistente.** A app pede-o ao browser (`navigator.storage.persist()`) só quando já há dados e de novo em cada abertura, enquanto não for concedido: os browsers tendem a aceitar mais depressa uma app já usada ou instalada. O browser pode recusar.
- **Cópia.** Em Definições › Dados: "Guardar cópia" descarrega um ficheiro JSON (o mesmo formato, com versão, validado com zod ao repor); "Repor cópia" substitui a casa deste browser; "Apagar os dados deste browser" remove-a, com a chave de IA e o registo de gastos.
- **Lembrete.** A faixa do topo mostra a data da última cópia (a do descarregamento: a app não sabe se o ficheiro foi guardado). Avisa quando há dados e nunca houve cópia, ou quando a cópia tem mais de 30 dias e a casa mudou desde então (`src/local/backup.ts`). Sem alterações não há aviso, por mais antiga que seja a cópia. Repor uma cópia conta como cópia.

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
| Clima (Open-Meteo, pedido pelo browser como sempre) | Sincronização entre aparelhos |
| IA com a chave do utilizador, guardada só neste browser (`src/ai/settings.ts`, como num servidor sem `AI_KEY_SECRET`) | |

## Limites

- Os dados perdem-se se o browser os apagar (limpeza de dados, janela privada, falta de espaço sem armazenamento persistente) ou ao mudar de aparelho: daí a cópia e o aviso no topo.
- Sem regras novas de privacidade: nenhuma ligação externa nova (regra 1), e o servidor não guarda nada destas casas.
