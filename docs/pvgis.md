# PVGIS — produção solar estimada

Fonte: **PVGIS** (Photovoltaic Geographical Information System), Centro Comum de Investigação (JRC) da Comissão Europeia. Consultado a **2026-10-29**.

- API: <https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en>
- Manual: <https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/pvgis-user-manual_en>

## Para que serve

Cartão "Painéis solares" em Tarifários: quanto produziriam painéis com a potência, a inclinação e a orientação que o utilizador indica, que parte dessa produção a casa gastaria no momento (autoconsumo), quanto sobraria e quanto pouparia na fatura com o tarifário atual. A produção vem do PVGIS; o cruzamento com o consumo real (quartos de hora dos últimos 365 dias) faz-se no browser (`src/domain/solar.ts`).

## Ligação externa (regra 1 do `CLAUDE.md`)

Autorizada pelo dono a 2026-10-29. O pedido parte do **Worker** (`GET /v1/solar`), só quando o utilizador carrega em "Calcular", porque o PVGIS **não aceita pedidos do browser**: "access to PVGIS APIs via AJAX is not allowed" (página da API).

O pedido leva **só**: as coordenadas do centro da localidade escolhida para o clima (centésimos de grau, ~1 km; as mesmas da Open-Meteo, nunca uma morada ou GPS), a inclinação, a orientação e as perdas. Não leva consumos, nem a potência dos painéis (pede-se sempre 1 kWp e o browser multiplica), nem nada que identifique a casa. O Worker reencaminha a resposta sem a interpretar (pouco CPU); o browser valida-a com zod e guarda-a em cache.

## Pedido

`https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=…&lon=…&peakpower=1&loss=…&angle=…&aspect=…&pvcalculation=1&startyear=2023&endyear=2023&outputformat=json`

Parâmetros (página da API, secção 2):

| Parâmetro | Significado |
|---|---|
| `lat`, `lon` | graus decimais; sul e oeste negativos |
| `peakpower` | potência nominal em kWp (sempre 1) |
| `loss` | perdas do sistema em %. "We have given a default value of 14% for the overall losses" (manual, 4.1: cabos, inversor, sujidade) — por isso 14 % por omissão |
| `angle` | inclinação em graus a partir da horizontal |
| `aspect` | orientação (azimute): **0 = sul, 90 = oeste, −90 = este** |
| `pvcalculation=1` | inclui a potência fotovoltaica `P` |
| `startyear`, `endyear` | **2023**: o último ano da base PVGIS-SARAH3 (`year_max` na resposta a 2026-10-29). Um ano real, não uma média: a produção de 2023 em Lisboa (1 kWp, 35°, sul) foi 1610 kWh, contra 1579 kWh da média 2005–2023 do `PVcalc` (+2 %) |

Limite: 30 pedidos por segundo por IP (HTTP 429); 529 quando está sobrecarregado.

## Resposta

JSON (~830 KB por ano), `outputs.hourly`: 8760 linhas (8784 num ano bissexto), por exemplo `{"time": "20230101:1210", "P": 80.91, "G(i)": 114.03, "H_sun": 27.88, "T2m": 18.01, "WS10m": 7.24, "Int": 0.0}`. Em `meta.outputs.hourly.variables`: `P` = "PV system power", em **W**.

- **Hora em UTC.** O manual não o diz para a série horária; verificado nos dados: a altura do sol (`H_sun`) é máxima entre as amostras das 12:10 e das 13:10 em janeiro, junho, julho e dezembro de 2023, ou seja, à volta das 12:37 UTC (meio-dia solar de Lisboa, longitude −9,14°). Com a hora legal, o máximo de verão passaria para as 13:10–14:10.
- **Os minutos ("…:10").** Com a base SARAH, "the irradiance value provided in PVGIS is the instantaneous irradiance at the time indicated in the timestamp" (manual, 9.3). A app usa cada valor como a potência média dessa hora UTC (energia = `P` × 1 h), espalhada por igual pelos seus quatro quartos de hora.

## Limites do cálculo (ditos ao utilizador)

- Produção de um ano real (2023), não deste ano; o consumo é o dos últimos 365 dias, emparelhado por dia e hora (29 de fevereiro usa o 28).
- A produção varia dentro da hora (nuvens): com médias horárias, o autoconsumo calculado tende a ser um pouco otimista.
- Sombras de prédios ou árvores próximas não entram (o PVGIS usa o horizonte do relevo, `use_horizon`).
- O excedente só vale o que o utilizador indicar (preço de venda): a app não inventa o preço da venda à rede.

## Bateria (opcional)

Simulada quarto de hora a quarto de hora sobre a mesma produção (`solarEffect` em `src/domain/solar.ts`). Todos os valores vêm do utilizador, da ficha técnica da bateria; a app não tem valores por omissão:

- **capacidade útil** (kWh), a que se pode usar, não a nominal;
- **eficiência de ida e volta** (%), aplicada toda ao carregar: de 100 Wh que entram, ficam guardados `eficiência` Wh;
- **potência máxima** (kW, opcional), que limita a carga e a descarga em cada quarto de hora (kW × ¼ h); sem ela, não há limite;
- **custo** (€, opcional), para o tempo de retorno.

Regras: a bateria começa vazia; carrega só com o excedente dos painéis (nunca da rede); descarrega quando a casa gasta mais do que os painéis produzem. O excedente guardado deixa de ser vendido: o retorno da bateria desconta essa venda perdida quando há preço de venda. Fora do cálculo: o desgaste ao longo dos anos, a reserva mínima de carga e a carga pela rede nas horas baratas.
