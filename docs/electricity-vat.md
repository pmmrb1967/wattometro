<!-- Copiado do Faturómetro (docs/electricity-vat.md), consultado em 2026-10-13. -->
# IVA na fatura de eletricidade

Fonte: **ERSE, "ERSExplica – Aplicação do IVA na fatura de eletricidade", fevereiro 2025** — <https://www.erse.pt/media/tcsfm4n2/ersexplica_iva-fatura_2025.pdf> (base legal citada: Lei n.º 38/2024, de 7 de agosto; em vigor desde 1 de janeiro de 2025). Consultado em 2026-10-13.

As regras são iguais no mercado regulado e no liberalizado.

## Portugal continental

| Componente | ≤ 3,45 kVA (1,15 / 2,3 / 3,45) | 4,6 – 6,9 kVA (4,6 / 5,75 / 6,9) | ≥ 10,35 kVA |
|---|---|---|---|
| Termo fixo da **tarifa de acesso às redes** (parte da potência) | 6 % | 23 % | 23 % |
| Termo de potência (restante) | 23 % | 23 % | 23 % |
| Energia até 200 kWh por 30 dias (300 kWh para famílias numerosas) | 6 % | 6 % | 23 % |
| Energia acima desse limiar | 23 % | 23 % | 23 % |
| Contribuição para o Audiovisual (CAV) | 6 % | 6 % | 6 % |
| Restantes componentes | 23 % | 23 % | 23 % |

Açores: 4 % / 16 %. Madeira: 5 % / 22 % (mesma estrutura).

**Limiar proporcional aos dias faturados:** kWh a taxa reduzida = (dias faturados / 30) × 200 (ou 300).

## Confirmação com faturas reais

Numa fatura Repsol de 6,9 kVA com 31 dias e 226 kWh: 207 kWh a 6 % (31/30 × 200 = 206,7 → 207) e 19 kWh a 23 %; o desconto social e o financiamento da tarifa social por kWh seguem a mesma divisão; a CAV a 6 %; a potência, a taxa DGEG e o resto a 23 %. O IVA calculado assim bate com o da fatura.

## Implicações para o comparador

- Os preços das ofertas da ERSE são **sem IVA** (ver `docs/erse-data.md`): o IVA é calculado pela app com estas regras.
- Para ≤ 3,45 kVA, a parte do termo fixo que é tarifa de acesso às redes leva 6 %, mas nem o CSV da ERSE nem o preço do termo de potência de um contrato separam essa parte: a app aplica 23 % a todo o termo fixo e avisa que, nessas potências, a estimativa fica ligeiramente acima.
- O estatuto de família numerosa (300 kWh) é uma definição do utilizador (no tarifário da casa).

## No Wattómetro

Valores usados: `src/data/electricity-vat.json`. O limiar aplica-se a um período de qualquer duração (num dia: 200/30 kWh).

As taxas da fatura (IEC, CAV, taxa DGEG) não fazem parte dos dados de referência: o utilizador copia-as da sua fatura para o tarifário da casa. A CAV leva 6 % e a taxa DGEG 23 % (tabela acima e fatura Repsol). O IEC (imposto especial de consumo, 0,001 €/kWh no continente segundo a EDP) leva **23 %**: a ERSE enumera as componentes com taxa reduzida (energia até ao limiar, termo fixo da tarifa de acesso até 3,45 kVA, CAV) e diz que "noutras componentes da fatura de eletricidade é aplicável a taxa de 23%" ([ERSExplica — Aplicação do IVA na fatura de eletricidade](https://www.erse.pt/media/tcsfm4n2/ersexplica_iva-fatura_2025.pdf), fevereiro de 2025, consultado em 2026-10-22). Antes a app seguia o Faturómetro e aplicava-lhe a divisão da energia (6 %/23 %).

**Descontos e tarifa social no tarifário da casa** (fatura Repsol de junho de 2026, consultada em 2026-10-22):
- Os descontos do comercializador ("Desc. FE", "Desc. DD", "Desc. Dual") são percentagens **só do termo de energia**, e seguem a divisão do IVA da energia. Ficam somados num único campo.
- O desconto social na energia (€/kWh) e o financiamento da tarifa social (€/kWh, em todas as faturas desde 1 de janeiro de 2026) seguem a divisão do IVA da energia. O desconto social na potência (€/dia) leva 23 %, como o termo de potência.
- Com tarifa social, o IEC aparece **isento** (0,00 €). Os beneficiários estão isentos de IEC ([EDP, FAQ sobre taxas e impostos](https://www.edp.pt/particulares/apoio-cliente/perguntas-frequentes/pt/faturas/sobre-a-sua-fatura/que-taxas-impostos-e-contribuicoes-me-sao-cobrados-e-o-que-sao/faq-5740/), consultado em 2026-10-22).
- Com estes campos, a estimativa da app fica a menos de 2 cêntimos do total da fatura (teste local com a fatura em `fixtures/private/`, que não vai para o repositório).
