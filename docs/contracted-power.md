# Escalões de potência contratada (BTN)

Consultado em **2026-10-22**. Dados usados pela app: `src/data/power-tiers.json`.

## Fontes

1. **ERSE, simulador de preços — CSV de ofertas comerciais** (`docs/erse-data.md`), ficheiro `20261019 172747 CSV.zip`, coluna `Pot_Cont` da tabela `Precos_ELEGN.csv`: as ofertas para clientes domésticos existem exatamente nestas potências (lista impressa por `pnpm erse:sync`).
2. **ERSE, "Períodos horários na energia elétrica em Portugal"**, setembro 2020, introdução: BTN = "potências contratadas inferiores ou iguais a 41,4 kVA".

## Escalões

1,15 · 2,3 · 3,45 · 4,6 · 5,75 · 6,9 · 10,35 · 13,8 · 17,25 · 20,7 · 27,6 · 34,5 · 41,4 kVA

Na app guardam-se em **VA inteiros** (1150 … 41400), como as outras grandezas (`src/lib/units.ts`).

## Quando o contador corta (controlo de potência)

Fonte: **E-Redes (EDP Distribuição), DEF-C44-506/N, edição 3** (julho de 2020), "Equipamento de Medição Inteligente, para pontos de BTN monofásicos/trifásicos — Especificação funcional", requisitos ICP_04, ICP_09 e ICP_13 e Anexo B1 "Curva de disparo do ICP": <https://www.e-redes.pt/sites/eredes/files/2020-07/DEF-C44-506_0.pdf>

- O contador compara a **potência aparente instantânea** (`Sinst`, VA) com a **potência limite** `Sc`, que é a potência contratada (salvo períodos de gestão da procura).
- Só pode abrir quando `Sinst > k × Sc`. Enquanto isso se mantiver, conta o tempo `Ti` (s); volta a 0 assim que `Sinst ≤ k × Sc`.
- Abre quando `Ti > Tdisp`, com **`Tdisp = Q / (Sinst/Sc − k)`** (segundos), recalculado continuamente ("pretende simular a curva de disparo de um disjuntor").
- Valores **por omissão** (parametrizáveis pela E-Redes): **Q = 50**; **k = 1,2** em monofásico, **k = 1,3** em trifásico.
- Trifásico: a mesma curva para a soma das fases e, em cada fase, com `Sf = max(Sc/3, S_PMF/k)` (`S_PMF` por omissão 0). Até 6,9 kVA conta a soma das fases (art. 25.º do RSRIDEE da ERSE).
- O contador não abre acima da corrente estipulada de corte (ICP_13).

Exemplos (monofásico, por omissão), para 6,9 kVA: até 8280 VA (× 1,2) nunca corta; 10 350 VA (× 1,5) corta ao fim de ~167 s; 13 800 VA (× 2) ao fim de 62,5 s.

**Por confirmar:** os valores de Q e k realmente configurados nos contadores instalados (a especificação diz que são parametrizáveis). A app usa os valores por omissão e di-lo ao utilizador; uma margem de segurança configurável cobre a diferença. Contadores antigos (não inteligentes) usam um disjuntor (DCP) com curva própria.

## Notas para a Fase 3.4 (recomendação de potência)

- O critério é em **potência aparente** (VA). O Shelly envia ao segundo a potência ativa `p` e a não ativa `q` (`docs/readings-1s.md`), logo `S = √(p² + q²)` a cada segundo (90 dias de retenção). Para períodos mais antigos só há `power_max_w` por minuto (potência **ativa**, que é ≤ S): a app avisa que a estimativa é menos segura.
- Com dados só da E-Redes (médias de 15 min) os picos não se veem: a app avisa e não recomenda descer de escalão com base nisso.
- O IVA reduzido na energia depende do escalão (até 6,9 kVA): `docs/electricity-vat.md`.
- **Período (2026-10-31): o último ano.** A recomendação simula 365 dias: ao segundo nos últimos 90 (retenção de `readings_1s`) e, antes, com o pico de cada minuto (`readings_1m`, 24 meses), contado o minuto inteiro, por prudência. "Perto do corte" fica nos 90 dias ao segundo. O cartão "O último ano" mostra o pico de cada mês (Shelly, de `daily`) e a maior média de 15 min da E-Redes; um mês sem Shelly cuja média de 15 min passa em 10 % ou mais a dos meses medidos dá um aviso (`src/domain/power-year.ts`). A E-Redes nunca serve para recomendar descer.

## Mudar de potência

Fonte: **ERSE, simulador de potência contratada**, perguntas frequentes ("Como se altera a potência contratada?" e seguintes): <https://simuladorpotencia.erse.pt/>, consultado a **2026-10-28** (a página não tem data; rodapé "ERSE © 2026").

- Pede-se ao **comercializador**, que, se for preciso, marca a visita de um técnico do operador da rede de distribuição, com acesso ao quadro elétrico.
- **Gratuita.** Subir de escalão aumenta a fatura (o termo de potência paga-se por dia).
- **Contador inteligente** integrado na rede: a alteração é feita **remotamente**, sem a presença do cliente; o comercializador informa se é o caso.
- Visita: janela de **até 2 h 30 min**; a alteração dura **cerca de 10 minutos**. Se o cliente não estiver na data e hora marcadas, **paga uma compensação**.
- A potência contratada **não pode exceder a potência requisitada** (Ficha Eletrotécnica da instalação).
- Ofertas comerciais podem limitar os escalões: fora deles, só com novo contrato.
- **Sem limite** ao número de mudanças.

Usado em Potência, "Como mudar de potência", quando o escalão recomendado é outro.

