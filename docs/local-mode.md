# Modo sem conta (local)

Para quem só tem o ficheiro da E-Redes e não quer conta: na página de entrada, "Usar sem conta". Decidido a 2026-10-29 (`planning/plan.md`, Decisões; capacidade e alternativas em `docs/hosting.md`).

## Como funciona

- **A casa fica neste browser.** Uma base IndexedDB própria (`wattometro-local`, `src/local/store.ts`) guarda um só registo: os quartos de hora da E-Redes, os tarifários, a zona de qualidade, a localidade, o orçamento e a instalação (`src/local/data.ts`). É separada das caches: "Sair" não a apaga.
- **Nada vai para o servidor.** `src/local/server.ts` responde no browser às mesmas rotas `/v1/...` que o Worker, com as mesmas formas de resposta, para uma casa sem Shelly (como a demonstração, `src/demo/server.ts`). As páginas e `src/app/api.ts` não mudam.
- **Volta sozinho.** O modo fica marcado neste browser (`localStorage`); ao abrir a app outra vez, entra nele. A app pede ao browser armazenamento persistente (`navigator.storage.persist()`), que o browser pode recusar.
- **Cópia.** Em Definições › Dados: "Guardar cópia" descarrega um ficheiro JSON (o mesmo formato, com versão, validado com zod ao repor); "Repor cópia" substitui a casa deste browser; "Apagar os dados deste browser" remove-a.

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
