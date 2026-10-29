# Fatura de eletricidade da Repsol → tarifário

Leitura do PDF da fatura em Definições › Tarifário › "Preencher com uma fatura" (`src/import/repsol-invoice.ts`). O PDF é lido no browser com o pdf.js (`src/pdf/`, do Faturómetro); o ficheiro e a password não saem do aparelho.

Formato confirmado em três faturas reais da Repsol de 2026 (opção simples), consultadas a 2026-10-29 (`fixtures/private/`, não vão para o Git). Os PDFs pedem uma password (o NIF do titular). O teste com as faturas reais só corre com `REPSOL_PDF_PASSWORD` definido e compara com os valores copiados à mão em `fixtures/private/repsol-electricity-invoices.json`.

## Estrutura

Um PDF tem a página de resumo, uma página por fatura (eletricidade e gás, cada uma com o seu código QR) e os dados do contrato. A página de eletricidade tem "Período Faturação: AAAA-MM-DD ~ AAAA-MM-DD" e uma tabela "Descrição | Explicação de valores | Valor(€) | IVA" até "Total sem IVA". Cada linha aparece duas vezes quando parte do consumo tem IVA a 6 % e parte a 23 %, com o mesmo preço.

## Linhas → campos

Exemplos com valores inventados.

| Linha da fatura | Explicação | Campo |
|---|---|---|
| `Energia Simples` | `150 kWh x 0,160000 €/kWh` | preço da energia (simples) |
| `Potência Contratada (6.90 kVA)` + `Redes Potência Contratada` | `30 dias x 0,100000 €/dia` + `30 dias x 0,300000 €/dia` | termo de potência = soma (0,4000 €/dia); potência contratada do nome |
| `Desc. FE / DD / Dual Energia Simples` | `30d/30d x (24,00 € x 1,00%)` | desconto na energia = soma das percentagens (1 + 1 + 2 = 4 %) |
| `Desc. Social Redes E. Simples` | `150 kWh x -0,046800 €/kWh` | desconto social na energia (sem o sinal) |
| `Desc. Social Redes Potência` | `30 dias x -0,216600 €/dia` | desconto social na potência |
| `Financ. T. Social (Dir. ERSE 3-4/2024)` | `150 kWh x 0,002067 €/kWh` | financiamento da tarifa social |
| `Contribuição Audiovisual` | `1,000000 meses x 2,850000 €/mês` | contribuição audiovisual |
| `Taxa Exploração DGEG (DL-4/93)` | (sem explicação) `0,07` | taxa DGEG: o valor da linha, por fatura mensal |
| `Imposto Especial Consumo` | `Isen. Imposto Especial Consumo` | IEC = 0 (isento); com preço, o preço |

Sem linhas "Desc. Social", os descontos sociais ficam 0. O comercializador fica "Repsol"; a data de início, o primeiro dia da fatura, exceto se todos os preços forem iguais aos do tarifário atual (nesse caso fica a data dele).

**Não confirmado numa fatura real:** os nomes das linhas na bi-horária e na tri-horária. A app aceita `Energia Vazio`/`Energia Fora de Vazio` e `Energia Ponta`/`Energia Cheias`/`Energia Vazio` (os nomes dos períodos do leitor do Faturómetro); se não encontrar uma opção completa, deixa a opção e os preços da energia como estavam e di-lo.

## Verificações

- Cada preço só é usado se `quantidade × preço` der o valor da linha (ao cêntimo).
- As linhas têm de somar o "Total sem IVA"; senão nada é usado.
- Uma linha com dois preços diferentes no mesmo período (mudança de preço a meio) não preenche o campo.
- Não vêm na fatura e ficam como estavam: o ciclo, os horários dos períodos e a família numerosa.
- O utilizador revê o formulário e guarda; o servidor valida-o com zod, como quando é preenchido à mão.
