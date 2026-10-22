# Escalões de potência contratada (BTN)

Consultado em **2026-10-22**. Dados usados pela app: `src/data/power-tiers.json`.

## Fontes

1. **ERSE, simulador de preços — CSV de ofertas comerciais** (`docs/erse-data.md`), ficheiro `20261019 172747 CSV.zip`, coluna `Pot_Cont` da tabela `Precos_ELEGN.csv`: as ofertas para clientes domésticos existem exatamente nestas potências (lista impressa por `pnpm erse:sync`).
2. **ERSE, "Períodos horários na energia elétrica em Portugal"**, setembro 2020, introdução: BTN = "potências contratadas inferiores ou iguais a 41,4 kVA".

## Escalões

1,15 · 2,3 · 3,45 · 4,6 · 5,75 · 6,9 · 10,35 · 13,8 · 17,25 · 20,7 · 27,6 · 34,5 · 41,4 kVA

Na app guardam-se em **VA inteiros** (1150 … 41400), como as outras grandezas (`src/lib/units.ts`).

## Notas para a Fase 3.4 (recomendação de potência)

- A potência contratada é aparente (kVA); o Shelly mede potência ativa (W) e aparente. A comparação com o escalão e o critério de disparo do contador ainda estão por documentar com fonte (pergunta em aberto para a Fase 3.4).
- O IVA reduzido na energia depende do escalão (até 6,9 kVA): `docs/electricity-vat.md`.
