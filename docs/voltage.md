# Tensão e interrupções (BT)

Consultado em **2026-10-22**. Base da Fase 5 (eventos de tensão, falhas de energia, relatório para reclamar).

## Fontes

1. **ERSE, Regulamento da Qualidade de Serviço (RQS)**, Regulamento n.º 826/2023, versão consolidada de janeiro de 2026: <https://www.erse.pt/media/sxlhtvlp/rqs_regulamento-da-qualidade-de-servi%C3%A7o_consolidado-2026.pdf>
2. **ERSE, "Qualidade de Serviço Técnica — Continuidade de serviço, Qualidade da energia elétrica"**, Formação ACE, 5 de fevereiro de 2021, diapositivo 36 ("Características da alimentação em baixa tensão", reprodução da NP EN 50160): <https://www.erse.pt/media/0bpcucwl/contservico_qstecnica.pdf>
3. **E-Redes, DIT-C14-100/N, edição 8** (julho de 2024), secção C1.2: "condições normativas máximas de 10% da tensão nominal", com remissão para o capítulo 4.2.2.1 da NP EN 50160, e tensão nominal fase-neutro de 230 V (capítulo 4.1): <https://www.e-redes.pt/sites/eredes/files/2024-07/DIT-C14-100%20Ed8.pdf>
4. **E-Redes, Relatório da Qualidade de Serviço 2023**: a conformidade da tensão em BT é avaliada sobre valores eficazes de **10 minutos**, por **semana**, excluindo os intervalos com interrupções.
5. **Shelly, API Gen2, `Sys.GetStatus`**: `uptime` = "Time in seconds since last reboot": <https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Sys>

A norma NP EN 50160 é paga (IPQ) e não foi consultada diretamente. Os valores abaixo vêm da sua reprodução pela ERSE (fonte 2) e são coerentes com as fontes 3 e 4.

## Tensão de alimentação em BT (NP EN 50160, via ERSE)

| Grandeza | Limite | Intervalo de avaliação | Medidas dentro do limite |
|---|---|---|---|
| Valor eficaz da tensão | ± 10 % de Un | cada semana | 95 % |
| Valor eficaz da tensão | + 10 % / − 15 % de Un | cada semana | 100 % |

- **Un = 230 V** (fase-neutro): ± 10 % = **207–253 V**; − 15 % = **195,5 V**.
- As "medidas" são os **valores eficazes médios de 10 min** (fonte 4). Uma semana tem 1008 intervalos de 10 min: no máximo 5 % (50) podem estar fora de 207–253 V, e nenhum fora de 195,5–253 V.
- O RQS (art. 25.º, n.º 3) obriga a cumprir a NP EN 50160 nos pontos de entrega em BT **em exploração normal**; ficam de fora a exploração perturbada e os eventos excecionais.

### Fenómenos curtos (definições do RQS, art. 2.º)

- **Cava de tensão:** descida da tensão para 90 %–5 % da tensão declarada, durante 10 ms a 1 min.
- **Sobretensão (swell):** aumento temporário acima de um limiar, com duração típica entre 10 ms e 1 min.
- Não têm limite numérico por cliente: o regulamento só os define. A app regista-os como **factos** (hora, duração, valor mínimo/máximo), sem dizer que violam alguma regra.

## Interrupções (RQS)

- **Início e fim** (art. 12.º): começa quando a tensão desce abaixo de **5 %** da tensão declarada em todas as fases; acaba quando volta a ser ≥ 5 %.
- **Breve:** ≥ 1 s e ≤ 3 min. **Longa:** > 3 min.
- **Previstas** (avisadas com antecedência) vs **acidentais**; os padrões individuais excluem eventos excecionais.
- **Zonas de qualidade de serviço** (art. 14.º, continente): **A** — capitais de distrito e localidades com mais de 25 000 clientes; **B** — localidades com 2 500 a 25 000 clientes; **C** — as restantes.
- **Padrões individuais em BT, por ano e por cliente** (Anexo I, C — interrupções acidentais longas):

| Zona | N.º de interrupções | Duração total (h) |
|---|---|---|
| A | 10 | 6 |
| B | 11 | 9 |
| C | 15 | 14 |

- **Compensação** automática, sem pedido do cliente (art. 24.º, n.ºs 5 e 6). A app calcula uma **estimativa** (`src/domain/compensation.ts`): ver a secção seguinte.

## Compensações

Consultado em **2026-10-28**. Fontes: RQS (fonte 1), art. 102.º, 106.º e 110.º e Anexo I, IV; **ERSE, "Tarifas e preços para a energia elétrica e outros serviços em 2026"**, Quadro 3-29: <https://www.erse.pt/media/irglmtt3/tarifas-e-pre%C3%A7os-se-2026.pdf>

- **Pelo número** (art. 102.º, n.º 1, a): `CN = (NI − NIP) × FC`, com NI as interrupções acidentais longas do ano (sem eventos excecionais) e NIP o padrão da zona.
- **Pela duração** (art. 102.º, n.º 1, c): `CD = (DI − DIP) × PC × KC`, com DI e DIP em horas e PC o valor médio da potência contratada no ano, em kVA.
- **Valores do Anexo I, IV, para BTN:** FC = **1,2 €**; KC = **0,45 €/kWh**. São atualizados todos os anos pela variação média do IPC sem habitação (art. 102.º, n.º 1, b e d); os valores atualizados não estão no regulamento e não os encontrámos publicados, por isso a app mostra o resultado como **estimativa** ("cerca de"), um pouco abaixo do valor real.
- **Paga-se a mais alta** das duas quando se falham os dois padrões (n.º 2).
- **Teto** (n.ºs 4 e 6): 200 % do que o cliente pagou no ano pelo valor médio da tarifa de uso das redes. Valor médio em **BTN em 2025: 0,0514 €/kWh** (Quadro 3-29, para incumprimentos de 2025). O de cada ano sai na diretiva de tarifas do ano seguinte; para o ano corrente a app usa o último conhecido e a energia do ano até agora.
- **Pagamento** (art. 106.º): o operador credita o comercializador até **12 de março** do ano seguinte; o comercializador credita o cliente na **primeira fatura emitida 30 dias depois** de receber. Sem pedido do cliente.
- **Abaixo de 0,50 €** não é paga ao cliente (art. 106.º, n.º 3, e art. 110.º, n.º 4: vai para as tarifas).
- **Exclusões** (art. 110.º): eventos excecionais, entre outras.

## Reclamação (RQS, art. 66.º)

- A reclamação sobre a qualidade da energia deve descrever os factos que indiciam parâmetros fora dos limites.
- O operador de rede responde em **15 dias úteis** (explicação, dados do contador inteligente ou verificação no local).
- Medições complementares podem ter custos para o reclamante, que tem de ser informado antes.

## O que o Shelly consegue e não consegue

- **Não é um analisador de classe A** (IEC 61000-4-30). Os valores são **indicativos**; o relatório diz isso.
- **Tensão:** o Shelly lê o valor eficaz cerca de 1×/s. O minuto guarda a tensão mín./méd./máx.; o valor de 10 min da app é a **média dos valores médios dos minutos** (aproximação do valor eficaz de 10 min da norma). Cavas e sobretensões com menos de ~1 s podem não ser vistas.
- **Interrupções:** o Shelly é alimentado pela rede, por isso **desliga-se** durante uma interrupção. A app deteta-a pelo **reinício do Shelly** (`uptime` → hora de arranque) e pela **falta de minutos**. Uma falha de internet ou de Wi-Fi não reinicia o Shelly (os minutos chegam depois, da fila), logo não conta como interrupção.
- A app **não distingue** interrupções acidentais, previstas ou de eventos excecionais, nem um reinício por atualização de firmware ou por o disjuntor da casa ter disparado. Mostra todas e diz isso; o utilizador pode marcar as que sabe que não contam.
- Interrupções com menos de alguns segundos podem passar despercebidas (o Shelly pode não chegar a reiniciar).
