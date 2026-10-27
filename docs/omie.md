# Preços do mercado OMIE e ofertas indexadas

Consultado em 2026-10-27.

## Fonte

- **OMIE** (Operador do Mercado Ibérico de Energia, polo espanhol), repositório público de ficheiros: <https://www.omie.es/en/file-access-list>, *Day-ahead Market → 1. Prices → Day-ahead market hourly price in Portugal* (`marginalpdbcpt`). Guarda os últimos 6 anos.
- Cada dia é um ficheiro: `https://www.omie.es/es/file-download?parents=marginalpdbcpt&filename=marginalpdbcpt_AAAAMMDD.1` (o `.1` é a versão).
- Formato: *Modelo de Ficheros para la distribución pública de Información del mercado de electricidad*, versão 1.38 de 22/09/2026, secção 5.1.1.1 (<https://www.omie.es/sites/default/files/2026-09/formato_ficheros_inf_pub_138.pdf>, ligado em <https://www.omie.es/en/publicaciones/64>).
- Condições de uso (*Legal warning*, <https://www.omie.es/en/legal-warning>): a informação pública e gratuita "pode ser usada livremente, respeitando integralmente o conteúdo original", e quem a usa tem de citar a fonte. A app cita-a ("OMIE (omie.es)") na página Tarifários.

## Formato do ficheiro

```
MARGINALPDBCPT;
2026;10;26;1;228.59;228.59;
2026;10;26;2;227.92;227.92;
…
*
```

Campos: ano; mês; dia; período (1 a 100); preço marginal da zona portuguesa; preço marginal da zona espanhola. Preços em **€/MWh**, com duas casas decimais. Podem ser negativos (no ficheiro de 2025–2026 há −10,00 €/MWh).

- **Hora:** "Las horas indicadas en la descarga corresponden a la Hora Central Europea (CET)" (secção 5 do documento): a hora de Espanha peninsular, sempre uma hora à frente de Lisboa, porque os dois países mudam a hora no mesmo instante (01:00 UTC). O dia D começa às 23:00 de D−1 em Lisboa (`startOfMadridDay` em `src/lib/time.ts`).
- **Períodos:** desde **01/10/2025**, um por **quarto de hora** (96 por dia; 92 e 100 nos dias de mudança de hora). Até 30/09/2025, um por **hora** (24; 23 e 25). Verificado nos ficheiros de 01/10/2025 (96), 26/10/2025 (100) e 26/10/2026 (96). Os períodos contam-se seguidos a partir da meia-noite, também nos dias de mudança de hora.

## O ficheiro da app

`pnpm omie:sync` (`scripts/omie-sync.ts`) descarrega os últimos 400 dias e o dia seguinte (publicado por volta das 13:00 CET), e escreve `public/data/omie-pt.json`:

- `start`: início do primeiro quarto de hora (epoch UTC, em segundos);
- `prices`: o preço de cada quarto de hora seguido, em **cêntimos por MWh** inteiros (unidades inteiras, regra 4). Os preços horários repetem-se nos quatro quartos de hora; um dia em falta fica com `null`.

Corre no PC ou no CI, nunca na app: o browser só lê o ficheiro servido com a app (sem ligação externa nova). Os dias que o ficheiro já tem não se voltam a pedir (`--force` pede todos).

Conversão para a fatura: 1 cêntimo/MWh = 10 µ€/kWh (`omieToMicro` em `src/lib/money.ts`).

## Ofertas indexadas da ERSE

O ficheiro da ERSE (`docs/erse-data.md`) marca as ofertas indexadas (`FiltroPrecosIndex_ELE = S`) e dá-lhes um **preço estimado por período**, como às de preço fixo. A fórmula de cada uma vem só em texto livre, e quase nunca com todos os parâmetros (margem, custos de gestão, perdas). Por isso a app **não recalcula o preço** de cada oferta: usa a estimativa da ERSE e corrige-a apenas pelo que depende do horário da casa.

Dois tipos, pelo texto de cada oferta (ficheiro da ERSE de 19/10/2026):

| Tipo | Comercializador e nome | O que diz o texto |
|---|---|---|
| à hora (`dynamic`) | ALFAENERGIA "… INDEX BTN" | "OMIE = Preço de energia por hora, no mercado OMIE" |
| à hora | AUDAX "TOP … INDEXADO" | "o preço do termo de energia é variável à hora" |
| à hora | COOP "Coopérnico ÚNICO" | "OMIE – Preço fixado em mercado grossista OMIE para cada hora do dia"; perdas de 15 % "como valor médio indicativo" |
| à hora | ZUG POWER "ZUG Dynamic" | "(OMIEh + CGSh + …) x (1 + Perdasqh)" |
| média (`average`) | EDPC "… Indexada média …" | "indexado ao valor médio registado no mercado grossista (OMIE PT) verificado no período de consumo" |
| média | GOLD "… Index …" | "Pomie = Valor médio do período de faturação" |
| média | NOSSAENERGIA "Tarifa Indexada …" | "preços do OMIE verificados no mês de faturação" |
| média | IBD "… Indexado …" | "média aritmética dos horários dos preços diários do OMIE" |

As restantes (Endesa, Plenitude, Luzboa, Oeneo, Portulogos) não dizem no ficheiro da ERSE se o preço é por hora ou a média do período: ficam com a estimativa da ERSE, sem ajuste. As regras estão em `src/data/indexed-offers.json` (comercializador e parte do nome); rever quando o `erse:sync` trouxer ofertas novas.

## O efeito do perfil

Em `src/domain/indexed.ts`, sobre os quartos de hora da casa (os mesmos 365 dias do simulador) que têm preço OMIE:

- preço da casa = Σ (energia × preço) / Σ energia;
- média = Σ preço / número de quartos de hora;
- efeito = preço da casa − média, por período da opção (simples; vazio e fora do vazio; vazio, cheias e ponta).

Nas ofertas **à hora**, o efeito soma-se ao preço estimado pela ERSE de cada período. Nas de **média** e nas sem fórmula, o horário não conta e fica o preço da ERSE. Com menos de 30 dias com preço, não há efeito.

Simplificações, ditas na página:

- **Perdas na rede:** os comercializadores multiplicam o preço OMIE por (1 + perdas), com perfis da ERSE que variam ao longo do dia; a Coopérnico indica 15 % como valor médio. O efeito não as inclui: seria cerca de 15 % maior.
- **Período da estimativa da ERSE:** a ERSE não diz que preço OMIE usa na estimativa. O efeito é uma diferença relativa (o horário da casa face à média do mesmo período), por isso não depende desse valor.

## Risco

A página mostra a média OMIE de cada mês inteiro dos dados (o mais barato e o mais caro): nas ofertas indexadas, a fatura acompanha esse preço.
